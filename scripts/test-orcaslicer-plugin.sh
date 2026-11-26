#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

mode=${1:-}
if [[ $# -gt 1 || (-n "$mode" && "$mode" != --browser) ]]; then
  echo "Usage: bash scripts/test-orcaslicer-plugin.sh [--browser]" >&2
  exit 2
fi

# Find the installed browser before changing HOME for isolation.
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright}
scratch=$(mktemp -d "${TMPDIR:-/tmp}/anystl-orca-test.XXXXXX")
server_pid=
cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -r -- "$scratch"
}
trap cleanup EXIT
export HOME="$scratch" HYPRLAND_INSTANCE_SIGNATURE= DISPLAY= WAYLAND_DISPLAY=
export XDG_CONFIG_HOME="$scratch/config" XDG_DATA_HOME="$scratch/data" XDG_CACHE_HOME="$scratch/cache"

python3 -I -B - orcaslicer/anystl.py "$scratch" <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import re
import subprocess
import sys
import threading
import time
import tomllib
import types
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

path = Path(sys.argv[1])
scratch = Path(sys.argv[2])
storage_dir = scratch / "plugin_data" / "anystl"
source = path.read_text(encoding="utf-8")

header, end, _ = source.removeprefix("# /// script\n").partition("\n# ///\n")
assert end
metadata = tomllib.loads("\n".join(line.removeprefix("#").removeprefix(" ") for line in header.splitlines()))
assert metadata["tool"]["orcaslicer"]["plugin"]["name"] == "AnyStl"
assert metadata["tool"]["orcaslicer"]["plugin"]["version"] == "0.2.0"
assert metadata["dependencies"] == []

packages, capabilities, perm_calls, posted = [], [], [], []


class PageBase:
    def get_config(self):
        return self.config

    def post_message(self, payload):
        posted.append(payload)


def plugin(package):
    packages.append(package)
    return package


def request_permissions(**kwargs):
    perm_calls.append(kwargs)


sys.modules["orca"] = types.SimpleNamespace(
    base=type("PackageBase", (), {}),
    pages=types.SimpleNamespace(PagesPluginCapabilityBase=PageBase),
    plugin=plugin,
    register_capability=capabilities.append,
    request_permissions=request_permissions,
    host=types.SimpleNamespace(
        plugin=types.SimpleNamespace(storage=lambda: str(storage_dir))
    ),
)

ns = {}
exec(compile(source, path, "exec"), ns)
assert len(packages) == 1
packages[0]().register_capabilities()
assert len(capabilities) == 1 and issubclass(capabilities[0], PageBase)

# Permissions declaration check (all network entries must be http(s):// with host).
assert len(perm_calls) == 1
perms = perm_calls[0]
assert perms["threading"] is True
assert isinstance(perms["process"], list) and len(perms["process"]) == 1
assert isinstance(perms["network"], list) and len(perms["network"]) >= 14
for entry in perms["network"]:
    parsed = urllib.parse.urlparse(entry)
    assert parsed.scheme in ("http", "https") and parsed.hostname, f"Invalid network permission: {entry}"

page = capabilities[0]()
assert page.get_name() == "AnyStl"
assert page.get_icon() == "search.svg"
defaults = page.get_default_config()
assert defaults["mode"] == "auto"
assert defaults["server_url"] == "http://127.0.0.1:3000"
for key in ("thingiverse_token", "myminifactory_key", "cults3d_username", "cults3d_api_key"):
    assert defaults[key] == ""


def destination(config):
    page.config = config
    match = re.search(r"window\.location\.replace\((.*?)\);", page.get_ui())
    return json.loads(match[1]) if match else None


# Forced server mode redirects to validated local origins.
assert destination(json.dumps({"mode": "server"})) == "http://127.0.0.1:3000/"
for url in ("http://127.0.0.1:3001", "http://localhost:8080", "https://[::1]:65535"):
    assert destination(json.dumps({"mode": "server", "server_url": url + "/"})) == url + "/"

# Invalid origins and malformed JSON are always rejected.
for url in (
    "https://example.com", "http://localhost.example.com", "http://localhost@evil.test",
    "file:///etc/hosts", "http://localhost:65536", "http://localhost:0", "http://localhost/search",
    "http://localhost/#x", "http://localhost/?x", 'http://localhost/"<script>', "http://localhost/\n",
    None, 3000,
):
    page.config = json.dumps({"mode": "server", "server_url": url})
    assert "Invalid AnyStl server URL" in page.get_ui(), url
for config in ("{", "[]", "null"):
    page.config = config
    assert "Invalid AnyStl server URL" in page.get_ui()

# Standalone mode renders embedded HTML without needing a local server.
page.config = json.dumps({"mode": "standalone"})
ui_html = page.get_ui()
assert "standalone OrcaSlicer mode" in ui_html
assert "BOOT =" in ui_html
assert "Send to Slicer" not in ui_html
assert "Open in OrcaSlicer" not in ui_html

# Validate the embedded JavaScript syntax via node --check (if node is available).
script_match = re.search(r"<script>([\s\S]*?)</script>", ui_html)
assert script_match, "Missing inline script in standalone UI"
js_file = scratch / "standalone.js"
js_file.write_text(script_match.group(1), encoding="utf-8")
subprocess.run(["node", "--check", str(js_file)], check=True)

# Auto mode falls back to standalone when nothing listens, and redirects when a server listens.
page.config = json.dumps({"mode": "auto", "server_url": "http://127.0.0.1:1"})
assert "standalone OrcaSlicer mode" in page.get_ui()


class _OkHandler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, *_args):
        return


srv = HTTPServer(("127.0.0.1", 0), _OkHandler)
srv_port = srv.server_address[1]
t = threading.Thread(target=srv.serve_forever, daemon=True)
t.start()
try:
    auto_origin = f"http://127.0.0.1:{srv_port}"
    assert destination(json.dumps({"mode": "auto", "server_url": auto_origin})) == auto_origin + "/"
finally:
    srv.shutdown()
    srv.server_close()

# Persistent saved models via orca.host.plugin.storage().
page.config = json.dumps({"mode": "standalone"})
sample_model = {
    "title": "Test Benchy",
    "url": "https://www.printables.com/model/3161-3dbenchy",
    "platform": "printables",
    "thumbnail": "https://media.printables.com/test.jpg",
    "likes": 42,
    "downloads": 100,
    "formats": ["STL"],
    "license": "CC BY",
}
bad_model = {"title": "Bad", "url": "javascript:alert(1)", "platform": "printables"}
page.on_message({"type": "save_saved", "items": [sample_model, bad_model]})
posted.clear()
page.on_message({"type": "load_saved"})
assert len(posted) == 1 and posted[0]["type"] == "saved_data"
assert len(posted[0]["items"]) == 1 and posted[0]["items"][0]["url"] == sample_model["url"]

# Search message bridge with mocked providers (offline).
orig_printables = ns["PROVIDERS"]["printables"]
orig_grabcad = ns["PROVIDERS"]["grabcad"]
try:
    ns["PROVIDERS"]["printables"] = lambda q, p, c: [sample_model]
    ns["PROVIDERS"]["grabcad"] = lambda q, p, c: (_ for _ in ()).throw(RuntimeError("boom"))
    posted.clear()
    page.on_message({"type": "search", "reqId": 7, "query": "benchy", "page": "bad", "platforms": ["printables", "grabcad"]})
    deadline = time.time() + 5
    while time.time() < deadline and not any(m.get("type") == "search_done" for m in posted):
        time.sleep(0.02)
    chunks = {m["platform"]: m for m in posted if m.get("type") == "search_chunk"}
    assert len(chunks["printables"]["results"]) == 1
    assert chunks["grabcad"]["error"] == "boom"
    assert any(m == {"type": "search_done", "reqId": 7} for m in posted)
finally:
    ns["PROVIDERS"]["printables"] = orig_printables
    ns["PROVIDERS"]["grabcad"] = orig_grabcad

print("PASS: OrcaSlicer standalone plugin metadata, permissions, routing, JS syntax, storage and bridge")
PY

if [[ "$mode" == --browser ]]; then
  export ANYSTL_DATA_DIR="$scratch/anystl" NEXT_TELEMETRY_DISABLED=1
  if [[ ! -f .next/BUILD_ID ]]; then
    echo "Run npm run build before using --browser." >&2
    exit 2
  fi
  node_modules/.bin/next start --hostname 127.0.0.1 --port 0 > "$scratch/next.log" 2>&1 &
  server_pid=$!
  if ! node scripts/test-orcaslicer-webview.mjs "$scratch/next.log"; then
    cat "$scratch/next.log" >&2
    exit 1
  fi
fi

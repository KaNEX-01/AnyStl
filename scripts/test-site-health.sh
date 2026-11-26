#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .next/BUILD_ID ]]; then
  echo "Run npm run build before testing Site health." >&2
  exit 2
fi

export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright}
scratch=$(mktemp -d "${TMPDIR:-/tmp}/anystl-health-test.XXXXXX")
pid=
trap 'if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; rm -r -- "$scratch"' EXIT
export HOME="$scratch/home" HYPRLAND_INSTANCE_SIGNATURE= DISPLAY= WAYLAND_DISPLAY=
export XDG_CONFIG_HOME="$scratch/config" XDG_DATA_HOME="$scratch/data" XDG_CACHE_HOME="$scratch/cache"
export ANYSTL_DATA_DIR="$scratch/anystl" NEXT_TELEMETRY_DISABLED=1
mkdir "$HOME"

node_modules/.bin/next start --hostname 127.0.0.1 --port 0 > "$scratch/server.log" 2>&1 &
pid=$!
base=
for ((i = 0; i < 100; i++)); do
  base=$(sed -nE 's/.*Local:[[:space:]]+(http:\/\/127\.0\.0\.1:[0-9]+).*/\1/p' "$scratch/server.log")
  if [[ -n "$base" ]] && curl -fsS --max-time 1 -o /dev/null "$base/health" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ -z "$base" ]] || ! curl -fsS --max-time 2 -o /dev/null "$base/health"; then
  cat "$scratch/server.log" >&2
  exit 1
fi

node --input-type=module - "$base" <<'JS'
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.argv[2];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let mode = "network";
  let blocked = true;
  let singleChecked = false;
  let resetCalled = false;
  const check = { kind: "check", status: "ok", count: 2, at: Date.now(), ms: 100 };
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === "/api/warmup") return route.fulfill({ status: 204 });
    if (url.pathname === "/api/health") {
      return route.fulfill({
        json: {
          sites: blocked
            ? [{ platform: "printables", blockedUntil: Date.now() + 300_000, recent: [] }]
            : [{ platform: "printables", recent: [check] }],
        },
      });
    }
    if (url.pathname === "/api/health/reset") {
      resetCalled = true;
      blocked = false;
      return route.fulfill({ json: { sites: [{ platform: "printables", recent: [] }] } });
    }
    if (url.pathname !== "/api/health/check") return route.continue();
    if (url.searchParams.get("platform") === "printables") {
      singleChecked = true;
      blocked = false;
      const events = [{ type: "site", platform: "printables", check }, { type: "done" }];
      return route.fulfill({ contentType: "application/x-ndjson", body: events.map(JSON.stringify).join("\n") + "\n" });
    }
    if (mode === "network") return route.abort("failed");
    if (mode === "http") return route.fulfill({ status: 503 });
    const events = [{ type: "site", platform: "printables", check }];
    if (mode === "ok") events.push({ type: "done" });
    return route.fulfill({ contentType: "application/x-ndjson", body: events.map(JSON.stringify).join("\n") + "\n" });
  });
  await page.goto(`${base}/health`);
  const resetBtn = page.getByRole("button", { name: "Reset", exact: true });
  await resetBtn.waitFor();
  await Promise.all([page.waitForResponse((res) => res.url() === `${base}/api/health/reset`), resetBtn.click()]);
  assert.equal(resetCalled, true);
  await resetBtn.waitFor({ state: "hidden" });

  const testOne = page.getByRole("button", { name: "Test Printables", exact: true });
  await Promise.all([page.waitForResponse((res) => res.url() === `${base}/api/health/check?platform=printables`), testOne.click()]);
  assert.equal(singleChecked, true);

  const run = page.getByRole("button", { name: "Run check", exact: true });
  const alert = page.getByRole("alert").filter({ hasText: "Could not complete the site check" });
  for (mode of ["network", "http", "truncated"]) {
    await Promise.all([page.waitForRequest((req) => req.url() === `${base}/api/health/check`), run.click()]);
    await alert.waitFor();
    assert.ok(await run.isEnabled());
    mode = "ok";
    await Promise.all([page.waitForResponse((res) => res.url() === `${base}/api/health/check`), run.click()]);
    await alert.waitFor({ state: "hidden" });
    await run.waitFor();
    assert.ok(await run.isEnabled());
  }
  assert.deepEqual(errors, []);
  console.log("PASS: Site health supports cooldown reset, per-site checks, and error recovery");
} finally {
  await browser.close();
}
JS

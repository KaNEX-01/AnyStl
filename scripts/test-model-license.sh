#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .next/BUILD_ID ]]; then
  echo "Run npm run build before testing the license panel." >&2
  exit 2
fi

export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright}
scratch=$(mktemp -d "${TMPDIR:-/tmp}/anystl-license-test.XXXXXX")
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
  if [[ -n "$base" ]] && curl -fsS --max-time 1 -o /dev/null "$base/featured" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ -z "$base" ]] || ! curl -fsS --max-time 2 -o /dev/null "$base/featured"; then
  cat "$scratch/server.log" >&2
  exit 1
fi

node --input-type=module - "$base" <<'JS'
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.argv[2];
const model = (slug, title, license) => ({
  url: `https://www.printables.com/model/${slug}`, title, license, platform: "printables",
  formats: ["STL"], thumbnail: "", price: "Free", likes: 1, downloads: 1, isAI: false, score: 1,
});
const known = model("1-known", "Creative Commons lamp", "CC0");
const custom = model("2-custom", "Custom terms lamp");
const missing = model("3-missing", "Unlicensed metadata lamp");
const unavailable = model("4-unavailable", "Unavailable details lamp", "CC-BY-SA");
const failed = model("5-failed", "Failed details lamp");
const originalTerms = "https://models.example/terms/personal-use";
let releaseMissing;
const missingReady = new Promise((resolve) => { releaseMissing = resolve; });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === "/api/warmup") return route.fulfill({ status: 204 });
    if (url.pathname === "/api/saved") return route.fulfill({ json: { saved: [] } });
    if (url.pathname === "/api/featured") {
      return route.fulfill({ json: { fetchedAt: Date.now(), sections: [{
        platform: "printables", results: [known, custom, missing, unavailable, failed],
      }] } });
    }
    if (url.pathname === "/api/details") {
      const modelUrl = url.searchParams.get("url");
      const details = { url: modelUrl, images: [], formats: ["STL"] };
      if (modelUrl === known.url) details.license = "CC BY-NC-ND 4.0";
      if (modelUrl === custom.url) Object.assign(details, { license: "Standard Digital File License", licenseUrl: originalTerms });
      if (modelUrl === missing.url) await missingReady;
      if (modelUrl === unavailable.url || modelUrl === failed.url) return route.fulfill({ status: 503 });
      return route.fulfill({ json: details });
    }
    return route.continue();
  });
  await page.goto(`${base}/featured`);

  async function open(model) {
    await page.getByRole("link").filter({ has: page.getByRole("heading", { name: model.title, exact: true }) }).click();
    const dialog = page.getByRole("dialog", { name: model.title, exact: true });
    const panel = dialog.getByRole("region", { name: "Model license" });
    await panel.waitFor();
    assert.equal(await panel.getByRole("link", { name: /Check on source site/ }).getAttribute("href"), model.url);
    return panel;
  }

  const close = () => page.getByRole("button", { name: "Close preview" }).click();
  let panel = await open(known);
  await panel.getByText("CC BY-NC-ND 4.0", { exact: false }).waitFor();
  await panel.getByText("Not allowed by this license", { exact: true }).waitFor();
  await panel.getByText("May not be shared under this license", { exact: true }).waitFor();
  await panel.getByText("Required when sharing", { exact: true }).waitFor();
  assert.equal(await panel.getByRole("link", { name: /Creative Commons license/ }).getAttribute("href"),
    "https://creativecommons.org/licenses/by-nc-nd/4.0/");
  await close();

  panel = await open(custom);
  await panel.getByText("Standard Digital File License", { exact: false }).waitFor();
  await panel.getByText(/can’t confirm reuse permissions/).waitFor();
  assert.equal(await panel.getByRole("link", { name: /Reported license terms/ }).getAttribute("href"), originalTerms);
  assert.equal(await panel.getByText("Commercial use", { exact: true }).count(), 0);
  await close();

  panel = await open(missing);
  await panel.getByText("Checking the source…", { exact: true }).waitFor();
  releaseMissing();
  await panel.getByText("License not stated", { exact: true }).waitFor();
  await panel.getByText(/can’t confirm reuse permissions/).waitFor();
  assert.equal(await panel.getByRole("link").count(), 1);
  await close();

  panel = await open(unavailable);
  await panel.getByText("CC-BY-SA", { exact: false }).waitFor();
  await panel.getByText("Listing or saved metadata", { exact: true }).waitFor();
  assert.equal(await panel.getByRole("link").count(), 1);
  await close();

  panel = await open(failed);
  await panel.getByText("Could not check the license", { exact: true }).waitFor();
  assert.equal(await panel.getByRole("link").count(), 1);
  assert.deepEqual(errors, []);
  console.log("PASS: model preview license summaries, source terms, missing licenses and unavailable details");
} finally {
  releaseMissing();
  await browser.close();
}
JS

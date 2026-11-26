import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLib } from "./helpers.mjs";

const { getDetails } = loadLib("details");

test("preview details keep a provider's license label and terms link", async (t) => {
  const uid = "b".repeat(32);
  const url = `https://sketchfab.com/3d-models/fixture-${uid}`;
  const licenseUrl = "https://creativecommons.org/licenses/by-nc/4.0/";
  t.mock.method(globalThis, "fetch", async (input) => {
    assert.equal(input, `https://api.sketchfab.com/v3/models/${uid}`);
    return Response.json({ isDownloadable: true, license: { label: "CC Attribution-NonCommercial", url: licenseUrl } });
  });
  const details = await getDetails(url, "sketchfab");
  assert.equal(details.license, "CC Attribution-NonCommercial");
  assert.equal(details.licenseUrl, licenseUrl);
  assert.ok(details.formats.includes("GLB"));
});

test("page fallback exposes model terms instead of the page's license", async (t) => {
  const url = "https://models.example/models/lamp";
  const licenseUrl = "https://models.example/terms";
  const graph = { "@graph": [
    { "@type": "WebPage", license: "CC0" },
    { "@type": "3DModel", license: { name: "Personal use only", url: licenseUrl } },
  ] };
  t.mock.method(globalThis, "fetch", async (input) => {
    assert.equal(input, url);
    return new Response(`<html><script type="application/ld+json">${JSON.stringify(graph)}</script><body>lamp.stl<!--${" ".repeat(1000)}--></body></html>`);
  });
  const details = await getDetails(url, "thingiverse");
  assert.equal(details.license, "Personal use only");
  assert.equal(details.licenseUrl, licenseUrl);
  assert.ok(details.formats.includes("STL"));
});

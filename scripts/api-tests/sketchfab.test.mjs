import assert from "node:assert/strict";
import { test } from "node:test";
import { loadScraper } from "./helpers.mjs";

test("Sketchfab searches only downloadable models and fills a page with two API requests", async (t) => {
  const { searchSketchfab } = loadScraper("sketchfab");
  const image = "https://media.sketchfab.com/thumbnails/vase.jpg";
  const fetch = t.mock.method(globalThis, "fetch", async (url) => {
    const target = new URL(url);
    assert.equal(target.origin + target.pathname, "https://api.sketchfab.com/v3/search");
    const count = Number(target.searchParams.get("count"));
    const cursor = Number(target.searchParams.get("cursor"));
    return Response.json({ results: Array.from({ length: count }, (_, i) => ({
      uid: String(cursor + i), name: `Vase ${cursor + i}`, likeCount: 8,
      thumbnails: { images: [{ url: image, width: 400 }] },
      isDownloadable: i === 0,
      archives: { glb: { type: "glb" }, gltf: { type: "gltf" }, source: { type: "source" } },
      license: i === 0 ? { label: "CC Attribution" } : null,
    })) });
  });
  const results = await searchSketchfab("vase", 2);
  assert.equal(results.length, 30);
  assert.equal(results[0].url, "https://sketchfab.com/3d-models/30");
  assert.equal(results[0].thumbnail, image);
  assert.equal(results[0].platform, "sketchfab");
  assert.deepEqual(results[0].formats, ["GLB", "GLTF"]);
  assert.equal(results[0].license, "CC Attribution");
  assert.equal(results[1].formats, undefined);
  assert.deepEqual(fetch.mock.calls.map(({ arguments: [url] }) => Object.fromEntries(new URL(url).searchParams)), [
    { type: "models", q: "vase", downloadable: "true", count: "24", cursor: "30" },
    { type: "models", q: "vase", downloadable: "true", count: "6", cursor: "54" },
  ]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadScraper } from "./helpers.mjs";

test("Poly Haven sends an identifiable user agent and searches its model catalog locally", async (t) => {
  const { searchPolyHaven } = loadScraper("polyhaven");
  const thumbnail = "https://cdn.polyhaven.com/asset_img/thumbs/chair.png";
  const catalog = {
    chair: { name: "Chair", tags: ["wood"], categories: ["furniture"], download_count: 10, thumbnail_url: thumbnail },
    rug: { name: "Rug", tags: [], categories: ["furniture"], download_count: 100, thumbnail_url: "" },
  };
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(catalog));
  const [chair] = await searchPolyHaven("wood chair");
  assert.equal(chair.title, "Chair");
  assert.equal(chair.thumbnail, thumbnail);
  assert.equal(chair.url, "https://polyhaven.com/a/chair");
  assert.equal(chair.price, "Free");
  assert.deepEqual(chair.formats, ["BLEND", "GLTF", "FBX", "USD"]);
  assert.equal(chair.license, "CC0 1.0");
  assert.deepEqual((await searchPolyHaven("furniture")).map((item) => item.title), ["Rug", "Chair"]);
  assert.equal(fetch.mock.callCount(), 1);
  const [url, request] = fetch.mock.calls[0].arguments;
  assert.equal(url, "https://api.polyhaven.com/assets?t=models");
  assert.equal(request.headers["User-Agent"], "AnyStl/0.1");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadScraper } from "./helpers.mjs";

test("Makeronline uses versioned model search and passes the requested page", async (t) => {
  const { searchMakeronline, featuredMakeronline } = loadScraper("makeronline");
  const model = { mold_id: 123, title: "Benchy", mold_image: "", like_num: 4, download_num: null, target_url: "" };
  const fetch = t.mock.method(globalThis, "fetch", async (url) => Response.json({
    code: 0, data: url.endsWith("/search/model/v2.8") ? { data: [model] } : [model],
  }));

  const [result] = await searchMakeronline("benchy", 2);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, "https://makeronline.com/api/search/model/v2.8");
  assert.equal(options.method, "POST");
  assert.deepEqual(JSON.parse(options.body), { page: 2, page_size: 30, keyword: "benchy", print_type: 0, search: 1 });
  assert.equal(result.platform, "makeronline");
  assert.equal(result.url, "https://www.makeronline.com/model/x/123.html");
  assert.equal(result.likes, 4);
  assert.equal(result.downloads, null);

  assert.equal((await featuredMakeronline())[0].title, "Benchy");
  assert.equal(fetch.mock.calls[1].arguments[0], "https://makeronline.com/api/index/recommend-trending/v2.5");
});

test("Makeronline reports upstream errors instead of returning empty results", async (t) => {
  const { searchMakeronline } = loadScraper("makeronline");
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: 1, message: "Server Error", data: null }));
  await assert.rejects(searchMakeronline("benchy"), /Makeronline API error: Server Error/);
});

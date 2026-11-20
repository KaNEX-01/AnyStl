import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadScraper, setTestEnv } from "./helpers.mjs";

const key = "fixture-private-key +/";
const sources = ["myminifactory"];
const cache = await mkdtemp(path.join(os.homedir(), "mmf-cache-"));
const previousCache = process.env.XDG_CACHE_HOME;
process.env.XDG_CACHE_HOME = cache;
const { searchAll } = loadScraper();
if (previousCache === undefined) delete process.env.XDG_CACHE_HOME;
else process.env.XDG_CACHE_HOME = previousCache;
await mkdir(path.join(cache, "anystl"));
await writeFile(path.join(cache, "anystl", "myminifactory-objects.txt"), "3d-print-cached-vase-42\n");

test("MyMiniFactory requests the documented search and prefers the primary API thumbnail", async (t) => {
  setTestEnv(t, "MYMINIFACTORY_API_KEY", key);
  const image = "https://assets.myminifactory.com/images/primary.png";
  const requests = t.mock.method(globalThis, "fetch", async () => Response.json({ items: [
    { name: " API Vase ", url: "https://www.myminifactory.com/object/3d-print-api-vase-123?tracking=x", likes: 7, images: [
      { standard: { url: "https://cdn.myminifactory.com/images/other.png" } },
      { is_primary: true, standard: { url: image } },
    ] },
    { name: "NSFW Vase", url: "https://www.myminifactory.com/object/3d-print-nsfw-vase-124" },
    { name: "Fake Vase", url: "https://example.test/object/3d-print-vase-125" },
  ] }));
  const { results, failed } = await searchAll("vase & pot", 2, sources);
  assert.deepEqual(failed, []);
  assert.equal(requests.mock.callCount(), 1);
  const [url, options] = requests.mock.calls[0].arguments;
  assert.equal(url.origin + url.pathname, "https://www.myminifactory.com/api/v2/search");
  assert.deepEqual(Object.fromEntries(url.searchParams), { q: "vase & pot", page: "2", per_page: "30", key });
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  assert.equal(results.length, 1);
  const [model] = results;
  assert.equal(model.url, "https://www.myminifactory.com/object/3d-print-api-vase-123");
  assert.equal(model.title, "API Vase");
  assert.equal(model.thumbnail, `/api/image?url=${encodeURIComponent(image)}`);
  assert.equal(model.likes, 7);
  assert.equal(model.price, "Price unknown");
});

test("MyMiniFactory keeps a successful empty API response instead of using the sitemap", async (t) => {
  setTestEnv(t, "MYMINIFACTORY_API_KEY", key);
  t.mock.method(globalThis, "fetch", async () => Response.json({ items: [] }));
  const { results, exhausted } = await searchAll("vase", 1, sources);
  assert.deepEqual(results, []);
  assert.deepEqual(exhausted, sources);
});

for (const configured of [false, true]) {
  test(`MyMiniFactory uses the existing sitemap when ${configured ? "the API is unavailable" : "there is no key"}`, async (t) => {
    setTestEnv(t, "MYMINIFACTORY_API_KEY", configured ? key : undefined);
    const requests = t.mock.method(globalThis, "fetch", async () => { throw new Error(key); });
    const warn = t.mock.method(console, "warn", () => {});
    const { results, failed } = await searchAll("vase", 1, sources);
    assert.deepEqual(failed, []);
    assert.equal(results[0].title, "Cached Vase");
    assert.equal(requests.mock.callCount(), Number(configured));
    assert.equal(warn.mock.callCount(), Number(configured));
    assert.ok(!JSON.stringify(warn.mock.calls.map((call) => call.arguments)).includes(key));
  });
}

test.after(() => rm(cache, { recursive: true, force: true }));

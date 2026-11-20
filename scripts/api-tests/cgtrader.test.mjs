import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { loadScraper, setTestEnv } from "./helpers.mjs";

const { searchAll, searchStream } = loadScraper();
const sources = ["cgtrader"];
const token = "fixture-cgtrader-token";

test("CGTrader uses bearer auth, requests the requested page and maps price and AI status", async (t) => {
  setTestEnv(t, "CGTRADER_ACCESS_TOKEN", token);
  const launch = t.mock.method(chromium, "launch", async () => { throw new Error("Unexpected browser launch"); });
  const requests = t.mock.method(globalThis, "fetch", async () => Response.json({ models: [
    { title: " Paid Vase ", url: "https://www.cgtrader.com/3d-models/decoration/vase?tracking=x", prices: { download: 4.5 }, ai_generated: true,
      thumbnails: ["https://invalid.test/vase.jpg", "https://img-new.cgtrader.com/items/vase.jpg"] },
    { title: "Free Vase", url: "https://www.cgtrader.com/3d-print-models/vase", prices: { download: 0 } },
    { title: "Wrong host", url: "https://example.test/3d-models/vase" },
  ] }));
  const { results, failed } = await searchAll("vase & pot", 3, sources);
  assert.deepEqual(failed, []);
  assert.equal(launch.mock.callCount(), 0);
  assert.equal(requests.mock.callCount(), 1);
  const [url, options] = requests.mock.calls[0].arguments;
  assert.equal(url.origin + url.pathname, "https://api.cgtrader.com/v1/models");
  assert.deepEqual(Object.fromEntries(url.searchParams), { keywords: "vase & pot", page: "3", per_page: "30", sort: "best_match" });
  assert.equal(options.headers.Authorization, `Bearer ${token}`);
  assert.equal(options.redirect, "error");
  assert.equal(results.length, 2);
  const paid = results.find((result) => result.title === "Paid Vase");
  assert.equal(paid.url, "https://www.cgtrader.com/3d-models/decoration/vase");
  assert.equal(paid.thumbnail, "https://img-new.cgtrader.com/items/vase.jpg");
  assert.equal(paid.price, "$4.5");
  assert.equal(paid.isAI, true);
  assert.equal(results.find((result) => result.title === "Free Vase").price, "Free");
});

test("a successful empty CGTrader response doesn't start the scraper", async (t) => {
  setTestEnv(t, "CGTRADER_ACCESS_TOKEN", token);
  t.mock.method(globalThis, "fetch", async () => Response.json({ models: [] }));
  const launch = t.mock.method(chromium, "launch", async () => { throw new Error("Unexpected browser launch"); });
  const { exhausted } = await searchAll("vase", 1, sources);
  assert.deepEqual(exhausted, sources);
  assert.equal(launch.mock.callCount(), 0);
});

for (const configured of [false, true]) {
  test(`CGTrader scrapes when ${configured ? "the API rejects the token" : "there is no token"}`, async (t) => {
    setTestEnv(t, "CGTRADER_ACCESS_TOKEN", configured ? token : undefined);
    const requests = t.mock.method(globalThis, "fetch", async () => new Response(token, { status: 401 }));
    const warn = t.mock.method(console, "warn", () => {});
    const listings = [];
    const closed = [];
    t.mock.method(chromium, "launch", async () => ({
      isConnected: () => false,
      version: () => "140.0",
      newContext: async () => ({
        newPage: async () => ({
          goto: async (url) => listings.push(url),
          waitForLoadState: async () => {},
          evaluate: async (fn) => fn.toString().includes("readyState") ? { found: true } : [
            { title: "Scraped Vase", url: "https://www.cgtrader.com/3d-models/vase", thumbnail: "", price: 0 },
          ],
          close: async () => closed.push(true),
        }),
      }),
    }));
    const events = [];
    await searchStream("vase", 2, sources, (event) => events.push(event));
    assert.equal(events[0].results[0].title, "Scraped Vase");
    assert.deepEqual(listings, ["https://www.cgtrader.com/search?keywords=vase&page=2"]);
    assert.equal(closed.length, 1);
    assert.equal(requests.mock.callCount(), Number(configured));
    assert.equal(warn.mock.callCount(), Number(configured));
    assert.ok(!JSON.stringify(warn.mock.calls.map((call) => call.arguments)).includes(token));
  });
}

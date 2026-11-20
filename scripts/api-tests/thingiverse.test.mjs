import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const { searchAll, searchStream, getSiteHealth } = require(path.join(process.env.ANYSTL_TEST_BUILD, "scrapers/index.js"));
const sources = ["thingiverse"];
const token = "fixture-token-not-a-real-secret";
const scraped = {
  title: "Scraped Vase", url: "https://www.thingiverse.com/thing:42", thumbnail: "", likes: 2,
  downloads: null, platform: "thingiverse",
};

function mockSearch(t, { respond, configured = true, scrapeFails = false } = {}) {
  const calls = { api: [], pages: 0, closed: 0, warnings: [] };
  const previous = process.env.THINGIVERSE_ACCESS_TOKEN;
  if (configured) process.env.THINGIVERSE_ACCESS_TOKEN = ` ${token} `;
  else delete process.env.THINGIVERSE_ACCESS_TOKEN;
  t.after(() => {
    if (previous === undefined) delete process.env.THINGIVERSE_ACCESS_TOKEN;
    else process.env.THINGIVERSE_ACCESS_TOKEN = previous;
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.api.push({ url, options });
    if (!respond) throw new Error("Unexpected API request");
    return respond();
  });
  t.mock.method(console, "warn", (...args) => calls.warnings.push(args.join(" ")));
  t.mock.method(chromium, "launch", async () => ({
    isConnected: () => false,
    version: () => "140.0",
    newContext: async () => ({
      newPage: async () => {
        calls.pages++;
        return {
          goto: async () => { if (scrapeFails) throw new Error("page didn't load in time"); },
          waitForSelector: async () => {},
          waitForTimeout: async () => {},
          evaluate: async (_fn, ...args) => args.length ? [scraped] : undefined,
          close: async () => { calls.closed++; },
        };
      },
    }),
  }));
  return calls;
}

test("uses the authenticated paginated Thingiverse API without opening a browser page", async (t) => {
  const thumbnail = "https://cdn.thingiverse.com/renders/vase.jpg";
  const hit = { id: 17, name: " Test Vase ", thumbnail, like_count: 24, download_count: 10, is_ai: true };
  const calls = mockSearch(t, { respond: () => Response.json({ hits: [hit, hit, { bad: true }] }) });
  const { results, failed, exhausted } = await searchAll("vazo / çiçek?", 2, sources);
  assert.deepEqual(failed, []);
  assert.deepEqual(exhausted, []);
  assert.equal(calls.pages, 0);
  assert.equal(calls.api.length, 1);
  const { url, options } = calls.api[0];
  const target = new URL(url);
  assert.equal(target.origin, "https://api.thingiverse.com");
  assert.equal(target.pathname, "/search/vazo%20%2F%20%C3%A7i%C3%A7ek%3F/");
  assert.deepEqual(Object.fromEntries(target.searchParams), { type: "things", sort: "relevant", page: "2", per_page: "40" });
  assert.equal(options.headers.Authorization, `Bearer ${token}`);
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Test Vase");
  assert.equal(results[0].url, "https://www.thingiverse.com/thing:17");
  assert.equal(results[0].thumbnail, `/api/image?url=${encodeURIComponent(thumbnail)}`);
  assert.equal(results[0].likes, 24);
  assert.equal(results[0].downloads, 10);
  assert.equal(results[0].isAI, true);
  assert.ok(!JSON.stringify(results).includes(token));
});

test("reports a successful empty API response as empty in the stream, without scraping", async (t) => {
  const calls = mockSearch(t, { respond: () => Response.json({ hits: [], total: 0 }) });
  const events = [];
  await searchStream("vase", 1, sources, (event) => events.push(event));
  assert.deepEqual(events, [{ platform: "thingiverse", results: [], status: "empty" }]);
  assert.equal(calls.api.length, 1);
  assert.equal(calls.pages, 0);
});

test("uses only the existing scraper when no token is configured", async (t) => {
  const calls = mockSearch(t, { configured: false });
  const { results } = await searchAll("vase", 1, sources);
  assert.equal(results[0].title, scraped.title);
  assert.equal(calls.api.length, 0);
  assert.equal(calls.pages, 1);
  assert.equal(calls.closed, 1);
  assert.deepEqual(calls.warnings, []);
});

for (const [name, respond] of [
  ["unauthorized", () => new Response(token, { status: 401 })],
  ["rate limited", () => new Response(null, { status: 429 })],
  ["invalid JSON", () => new Response("<html>Blocked</html>")],
  ["unexpected schema", () => Response.json({ hits: [{ unknown: 1 }] })],
  ["timeout", () => { throw new DOMException(token, "TimeoutError"); }],
]) {
  test(`falls back to scraping when the API is ${name}, without logging the token`, async (t) => {
    const calls = mockSearch(t, { respond });
    const events = [];
    await searchStream("vase", 1, sources, (event) => events.push(event));
    assert.equal(events.length, 1);
    assert.equal(events[0].status, "ok");
    assert.equal(events[0].results[0].title, scraped.title);
    assert.equal(calls.api.length, 1);
    assert.equal(calls.pages, 1);
    assert.equal(calls.closed, 1);
    assert.equal(calls.warnings.length, 1);
    assert.ok(!calls.warnings[0].includes(token));
  });
}

test("the API still works while the browser scraper is cooling down", async (t) => {
  let available = false;
  const calls = mockSearch(t, {
    scrapeFails: true,
    respond: () => available ? Response.json({ hits: [{ id: 77, name: "API Vase" }] }) : new Response(null, { status: 503 }),
  });
  t.mock.method(console, "error", () => {});
  for (let i = 0; i < 3; i++) {
    assert.deepEqual((await searchAll("vase", 1, sources)).failed, sources);
  }
  assert.ok(getSiteHealth().find((site) => site.platform === "thingiverse").blockedUntil > Date.now());
  const blocked = await searchAll("vase", 1, sources);
  assert.match(blocked.errors[0], /skipped/);
  available = true;
  assert.equal((await searchAll("vase", 1, sources)).results[0].title, "API Vase");
  assert.equal(calls.api.length, 5);
  assert.equal(calls.pages, 3);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { loadLib, loadScraper, setTestEnv } from "./helpers.mjs";

const { searchAll, searchStream } = loadScraper();
const { searchTraceParts } = loadScraper("traceparts");
const { availableSearchPlatforms } = loadLib("sourceAvailability");
const source = ["traceparts"];
const apiKey = "fixture-private-key";
const tenantUid = "2b60e9dd-bc45-492e-abbd-41dbe0123412";
const token = "fixture-private-jwt";
const cover = "https://cdn-product-content.traceparts.com/TraceParts/PartFamilies/fixture/ball.png";
const product = { partFamilyCode: "FAMILY-01", label: " Báll Bearing ", providerCode: "FixtureVendor", pictureUrl: cover };

function configure(t, classification, overrides = {}) {
  const env = {
    TRACEPARTS_API_KEY: ` ${apiKey} `, TRACEPARTS_TENANT_UID: tenantUid,
    TRACEPARTS_CLASSIFICATION_CODE: classification, TRACEPARTS_EASYLINK_ID: "fixture-cad",
    TRACEPARTS_CATEGORY_CODE: undefined, ...overrides,
  };
  for (const [k, v] of Object.entries(env)) setTestEnv(t, k, v);
  return t.mock.method(chromium, "launch", async () => { throw new Error("Unexpected browser launch"); });
}

test("TraceParts uses the token and catalog APIs once, then searches and pages locally", async (t) => {
  const launch = configure(t, "Fixture & catalog", { TRACEPARTS_CATEGORY_CODE: " category / A " });
  const catalog = Array.from({ length: 32 }, (_, i) => ({
    ...product, partFamilyCode: `FAMILY-${i + 1}`, label: ` Báll Bearing ${i + 1} `,
    pictureUrl: i === 31 ? "https://example.test/unsafe.png" : cover,
  }));
  const request = t.mock.method(globalThis, "fetch", async (url) => String(url).endsWith("/RequestToken")
    ? Response.json({ token }) : Response.json([...catalog, catalog[0], { label: "Missing code" }]));
  const streamed = [];
  const [first] = await Promise.all([
    searchTraceParts("ball bearing FixtureVendor", 1),
    searchStream("BALL bearing", 2, source, (e) => streamed.push(e)),
  ]);
  assert.equal(first.length, 30);
  const second = streamed[0].results;
  assert.equal(streamed[0].status, "ok");
  assert.deepEqual(second.map((r) => r.title), ["Báll Bearing 31", "Báll Bearing 32"]);
  assert.equal(first[0].url, "https://www.traceparts.com/els/fixture-cad/goto?Product=FAMILY-1");
  assert.equal(first[0].thumbnail, cover);
  assert.equal(second[1].thumbnail, "");
  assert.equal(first[0].price, undefined);
  assert.deepEqual((await searchAll("ball bearing", 3, source)).exhausted, source);
  assert.deepEqual(await searchTraceParts("nonexistent"), []);
  assert.deepEqual((await searchTraceParts("FAMILY-22")).map((r) => r.title), ["Báll Bearing 22"]);
  assert.equal(launch.mock.callCount(), 0);
  assert.equal(request.mock.callCount(), 2);
  assert.ok(availableSearchPlatforms().includes("traceparts"));
  const [[authUrl, auth], [listUrl, list]] = request.mock.calls.map((call) => call.arguments);
  assert.equal(authUrl, "https://api-gateway.traceparts.com/v2/RequestToken");
  assert.equal(auth.method, "POST");
  assert.deepEqual(JSON.parse(auth.body), { apiKey, tenantUid });
  assert.equal(listUrl.origin + listUrl.pathname, "https://api-gateway.traceparts.com/v2/Search/ProductList");
  assert.deepEqual(Object.fromEntries(listUrl.searchParams), { cultureInfo: "en", classificationCode: "Fixture & catalog", categoryCode: "category / A" });
  assert.equal(list.headers.Authorization, `Bearer ${token}`);
  assert.equal(auth.redirect, "error");
  assert.equal(list.redirect, "error");
  assert.ok(!JSON.stringify([first, streamed]).includes(apiKey) && !JSON.stringify([first, streamed]).includes(token));
});

test("TraceParts without complete configuration produces no requests or source events", async (t) => {
  configure(t, "Fixture", { TRACEPARTS_EASYLINK_ID: undefined });
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected API request"); });
  assert.ok(!availableSearchPlatforms().includes("traceparts"));
  await searchStream("bearing", 1, source, () => assert.fail("Unavailable source emitted an event"));
  assert.deepEqual(await searchTraceParts("bearing"), []);
  assert.equal(fetch.mock.callCount(), 0);
  const link = new URL(loadLib("platforms").PLATFORMS.traceparts.searchUrl("M8 & 6204"));
  assert.equal(link.origin + link.pathname, "https://www.traceparts.com/en/search");
  assert.equal(link.searchParams.get("Keywords"), "M8 & 6204");
});

test("TraceParts refreshes the catalog after one hour", async (t) => {
  configure(t, "Expiry fixture");
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const request = t.mock.method(globalThis, "fetch", async (url) => String(url).endsWith("/RequestToken")
    ? Response.json({ token }) : Response.json([product]));
  await searchTraceParts("bearing");
  now += 60 * 60 * 1000 - 1;
  await searchTraceParts("bearing");
  assert.equal(request.mock.callCount(), 2);
  now++;
  await searchTraceParts("bearing");
  assert.equal(request.mock.callCount(), 4);
});

test("TraceParts sanitizes API failures, leaves other sources working, and can retry", async (t) => {
  configure(t, "Retry fixture");
  const log = t.mock.method(console, "error", () => {});
  let fail = true;
  const request = t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("wikimedia.org")) return Response.json({ batchcomplete: true });
    if (String(url).endsWith("/RequestToken")) return Response.json({ token });
    assert.ok(!url.searchParams.has("categoryCode"));
    return fail ? new Response(`${apiKey} ${token}`, { status: 403 }) : Response.json([product]);
  });
  const result = await searchAll("bearing", 1, [...source, "wikimedia"]);
  assert.deepEqual(result.failed, source);
  assert.deepEqual(result.exhausted, ["wikimedia"]);
  assert.deepEqual(result.errors, ["TraceParts: API returned HTTP 403"]);
  const exposed = JSON.stringify([result, log.mock.calls.map((call) => call.arguments)]);
  assert.ok(!exposed.includes(apiKey) && !exposed.includes(token));
  fail = false;
  assert.equal((await searchTraceParts("bearing"))[0].title, "Báll Bearing");
  assert.equal(request.mock.callCount(), 5);
});

test("TraceParts treats a valid empty catalog differently from malformed data", async (t) => {
  configure(t, "Empty fixture");
  let data = null;
  t.mock.method(globalThis, "fetch", async (url) => String(url).endsWith("/RequestToken")
    ? Response.json({ token }) : Response.json(data));
  await assert.rejects(searchTraceParts(""), /invalid catalog response/);
  data = [];
  assert.deepEqual(await searchTraceParts(""), []);
});

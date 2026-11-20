import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { loadLib, loadScraper, setTestEnv } from "./helpers.mjs";

const { searchAll, searchStream } = loadScraper();
const { isFree, applyFilters, DEFAULT_FILTERS } = loadLib("filters");
const { availableSearchPlatforms } = loadLib("sourceAvailability");
const sources = ["cults3d"];
const key = "fixture-cults3d-key";
const username = "fixture-user";
const body = (results) => ({ data: { creationsSearchBatch: { results } } });

function configure(t) {
  setTestEnv(t, "CULTS3D_USERNAME", ` ${username} `);
  setTestEnv(t, "CULTS3D_API_KEY", ` ${key} `);
  return t.mock.method(chromium, "launch", async () => { throw new Error("Unexpected browser launch"); });
}

test("Cults3D sends Basic auth and GraphQL variables and maps prices without treating unknown prices as free", async (t) => {
  const launch = configure(t);
  const cover = "https://images.cults3d.com/render/vase.jpg";
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(body([
    { name: " Test Vase ", url: "https://cults3d.com/en/3d-model/home/test-vase?tracking=1", shortUrl: "https://cults3d.com/:86",
      illustrationImageUrl: cover, likesCount: 16, downloadsCount: 99, price: { cents: 450 } },
    { name: "Free Vase", shortUrl: "https://cults3d.com/:87", price: { cents: 0 } },
    { name: "Unknown Price", shortUrl: "https://cults3d.com/:88", illustrationImageUrl: "https://example.test/c.jpg", price: null },
    { name: "Wrong host", shortUrl: "https://example.test/:89" },
  ])));
  const query = 'vase "&" çiçek';
  const { results, failed } = await searchAll(query, 2, sources);
  assert.ok(availableSearchPlatforms().includes("cults3d"));
  assert.equal(launch.mock.callCount(), 0);
  assert.deepEqual(failed, []);
  assert.equal(fetch.mock.callCount(), 1);
  const [url, init] = fetch.mock.calls[0].arguments;
  const request = JSON.parse(init.body);
  assert.equal(url, "https://cults3d.com/graphql");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, `Basic ${Buffer.from(`${username}:${key}`).toString("base64")}`);
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.equal(init.redirect, "error");
  assert.equal(init.cache, "no-store");
  assert.match(request.query, /creationsSearchBatch\(query: \$query, limit: \$limit, offset: \$offset\)/);
  assert.ok(!init.body.includes(key));
  assert.deepEqual(request.variables, { query, limit: 30, offset: 30 });
  assert.equal(results.length, 3);
  const paid = results.find((r) => r.title === "Test Vase");
  const unknown = results.find((r) => r.title === "Unknown Price");
  assert.equal(paid.url, "https://cults3d.com/en/3d-model/home/test-vase");
  assert.equal(paid.thumbnail, cover);
  assert.equal(paid.likes, 16);
  assert.equal(paid.downloads, 99);
  assert.equal(paid.price, "$4.50");
  assert.equal(unknown.thumbnail, "");
  assert.equal(isFree(unknown), false);
  assert.equal(isFree(paid), false);
  assert.deepEqual(applyFilters(results, { ...DEFAULT_FILTERS, freeOnly: true }, []).map((r) => r.url), ["https://cults3d.com/:87"]);
});

test("an unconfigured Cults3D is not searched or reported as failed or empty", async (t) => {
  setTestEnv(t, "CULTS3D_USERNAME", username);
  setTestEnv(t, "CULTS3D_API_KEY", " ");
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected API request"); });
  const available = availableSearchPlatforms();
  assert.ok(!available.includes("cults3d"));
  assert.ok(available.includes("yeggi") && available.includes("wikimedia"));
  assert.deepEqual(await searchAll("vase", 1, sources), { results: [], errors: [], exhausted: [], failed: [] });
  await searchStream("vase", 1, sources, () => assert.fail("Unavailable source emitted an event"));
  assert.equal(fetch.mock.callCount(), 0);
});

test("Cults3D reports an empty GraphQL batch as an exhausted source", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => Response.json(body([])));
  const events = [];
  await searchStream("vase", 1, sources, (event) => events.push(event));
  assert.deepEqual(events, [{ platform: "cults3d", results: [], status: "empty" }]);
});

for (const [failure, response, message] of [
  ["HTTP error", () => new Response(key, { status: 401 }), /HTTP 401/],
  ["GraphQL errors", () => Response.json({ ...body([]), errors: [{ message: key }] }), /GraphQL errors/],
  ["malformed data", () => Response.json({ data: null }), /invalid search response/],
]) {
  test(`Cults3D reports ${failure} without leaking credentials or breaking other sources`, async (t) => {
    const launch = configure(t);
    const errors = t.mock.method(console, "error", () => {});
    t.mock.method(globalThis, "fetch", async (url) => String(url).includes("cults3d.com") ? response() : Response.json({ batchcomplete: true }));
    const result = await searchAll("vase", 1, [...sources, "wikimedia"]);
    assert.deepEqual(result.failed, sources);
    assert.deepEqual(result.exhausted, ["wikimedia"]);
    assert.match(result.errors[0], message);
    assert.ok(!JSON.stringify([result, errors.mock.calls.map((c) => c.arguments)]).includes(key));
    assert.equal(launch.mock.callCount(), 0);
  });
}

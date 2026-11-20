import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { loadScraper } from "./helpers.mjs";

const { searchAll, searchStream } = loadScraper();
const sources = ["wikimedia"];
const cover = "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Vase.stl/500px-Vase.stl.png";

const page = (name, index, thumburl, host = "commons.wikimedia.org") => ({
  ns: 6, index, title: `File:${name}`,
  imageinfo: [{ descriptionurl: `https://${host}/wiki/File:${name.replaceAll(" ", "_")}`, thumburl }],
});

test("Commons searches files without credentials, pages by offset, and uses the ranked STL file pages", async (t) => {
  const launch = t.mock.method(chromium, "launch", async () => { throw new Error("Unexpected browser launch"); });
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
    batchcomplete: true,
    continue: { gsroffset: 60 },
    query: { pages: [
      page("Second Vase.STL", 32, "https://example.test/ignored.png"),
      page("Not A Model.png", 33, cover),
      page("First Vase.stl", 31, cover),
      page("Wrong Host.stl", 34, cover, "example.test"),
    ] },
  }));
  const events = [];
  await searchStream("vase & çiçek", 2, sources, (event) => events.push(event));
  assert.equal(launch.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 1);
  const [url, init] = fetch.mock.calls[0].arguments;
  assert.equal(url.origin + url.pathname, "https://commons.wikimedia.org/w/api.php");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    action: "query", generator: "search", gsrnamespace: "6", gsrsearch: "vase & çiçek filetype:3d",
    gsrlimit: "30", gsroffset: "30", prop: "imageinfo", iiprop: "url", iiurlwidth: "400", format: "json", formatversion: "2",
  });
  assert.match(init.headers["User-Agent"], /^AnyStl\//);
  assert.equal(init.headers.Authorization, undefined);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "ok");
  assert.deepEqual(events[0].results.map(({ title, url, thumbnail, price, platform }) => ({ title, url, thumbnail, price, platform })), [
    { title: "First Vase", url: "https://commons.wikimedia.org/wiki/File:First_Vase.stl", thumbnail: cover, price: "Free", platform: "wikimedia" },
    { title: "Second Vase", url: "https://commons.wikimedia.org/wiki/File:Second_Vase.STL", thumbnail: "", price: "Free", platform: "wikimedia" },
  ]);
});

test("Commons distinguishes a genuine empty response from an API error", async (t) => {
  const [empty, error] = [{ batchcomplete: true }, { error: { code: "maxlag" } }];
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(empty));
  fetch.mock.mockImplementationOnce(async () => Response.json(error), 1);
  t.mock.method(console, "error", () => {});
  assert.deepEqual((await searchAll("vase", 3, sources)).exhausted, sources);
  assert.deepEqual((await searchAll("vase", 3, sources)).failed, sources);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLib, loadScraper } from "./helpers.mjs";

const { applyFilters, DEFAULT_FILTERS } = loadLib("filters");
const { formatsFromNames } = loadLib("modelFormats");
const { urlFor, readUrlState } = loadLib("urlState");
const { toModel, toSavedModel } = loadLib("savedValidation");
const model = { title: "lamp", url: "https://example.test/lamp", thumbnail: "", platform: "printables", likes: 0, downloads: null };

test("format filters use listed extensions only and preserve unknown results as a separate choice", () => {
  assert.deepEqual(formatsFromNames(["A.STL", "assembly.stp", "a.step", "shape.IGS", "backup.stl.zip", "README.md"]), ["STL", "STEP", "IGES"]);
  const results = [
    { ...model, title: "known", formats: ["STL", "STEP"], license: "CC BY 4.0" },
    { ...model, title: "STEP advertised in title" },
    { ...model, title: "no formats", formats: [] },
  ];
  assert.deepEqual(applyFilters(results, { ...DEFAULT_FILTERS, format: "STEP" }, []), [results[0]]);
  assert.deepEqual(applyFilters(results, { ...DEFAULT_FILTERS, format: "unknown" }, []), results.slice(1));
  assert.deepEqual(applyFilters(results, { ...DEFAULT_FILTERS, format: "STEP", license: "noncommercial" }, []), []);
});

test("license filters separate missing terms from recognized permissive or noncommercial labels", () => {
  const licenses = ["CC0 1.0", "CC-BY-SA", "CC BY 4.0", "CC Attribution-ShareAlike", "CC-BY-NC-SA", "CC Attribution-NonCommercial-NoDerivs", "CC BY-ND", "Standard Digital File License", undefined, "  "];
  const results = licenses.map((license) => ({ ...model, license, price: "Free" }));
  const match = (license) => applyFilters(results, { ...DEFAULT_FILTERS, license }, []).map((m) => m.license);
  assert.deepEqual(match("commercial"), licenses.slice(0, 4));
  assert.deepEqual(match("noncommercial"), licenses.slice(4, 6));
  assert.deepEqual(match("unknown"), licenses.slice(-2));
});

test("format and license selections round-trip in shared links; invalid values are ignored", (t) => {
  const state = { query: "lamp", sort: "fair", filters: { ...DEFAULT_FILTERS, format: "STEP", license: "commercial" } };
  const url = urlFor(state);
  assert.equal(url, "/?q=lamp&format=STEP&license=commercial");
  const previous = globalThis.window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  globalThis.window = { location: { search: new URL(url, "http://localhost").search } };
  assert.deepEqual(readUrlState(), state);
  globalThis.window.location.search = "?q=lamp&format=invalid&license=invalid";
  assert.deepEqual(readUrlState().filters, DEFAULT_FILTERS);
});

test("source metadata is kept when saving and importing models", () => {
  const result = { ...model, license: "CC BY-SA 4.0", formats: ["STL", "STEP", "STL"] };
  assert.deepEqual(toModel(result).formats, ["STL", "STEP"]);
  assert.equal(toSavedModel(result).license, "CC BY-SA 4.0");
  assert.equal(toModel({ ...model, formats: { STL: true } }).formats, undefined);
});

test("3D Warehouse uses model binaries, not the presence of a thumbnail, to report formats", async (t) => {
  const { searchWarehouse3d } = loadScraper("warehouse3d");
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ entries: [
    { title: "chair", id: "1", binaries: { source_skp: { contentUrl: "https://example.test/model" }, bot_lt: { contentUrl: "https://example.test/thumbnail" }, glb: {}, zip: { contentUrl: "https://example.test/archive" } } },
    { title: "table", id: "2", binaries: { bot_lt: { contentUrl: "https://example.test/thumbnail" } } },
  ] }));
  const results = await searchWarehouse3d("furniture");
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(results.map((m) => m.formats), [["SKP"], []]);
});

test("BlenderKit and Tinkercad include guaranteed formats and recognized CC0 labels in search results", async (t) => {
  const { searchBlenderKit } = loadScraper("blenderkit");
  const { searchTinkercad } = loadScraper("tinkercad");

  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("blenderkit.com")) {
      return Response.json({
        results: [
          { id: "a1", name: "Wood Chair", isFree: true, isPrivate: false, license: "cc_zero", thumbnailMiddleUrl: null, thumbnailSmallUrl: null, ratingsCount: { bookmarks: 5 }, dictParameters: null },
          { id: "a2", name: "Paid Lamp", isFree: false, isPrivate: false, license: "royalty_free", thumbnailMiddleUrl: null, thumbnailSmallUrl: null, ratingsCount: null, dictParameters: null },
        ],
      });
    }
    return Response.json({
      designs: [
        { id: "t1", description: "Gear Box", number_likes: 3, thumbnail_json: null },
      ],
    });
  });

  const bk = await searchBlenderKit("chair");
  assert.deepEqual(bk.map((m) => m.formats), [["BLEND"], ["BLEND"]]);
  assert.deepEqual(bk.map((m) => m.license), ["CC0 1.0", undefined]);

  const tc = await searchTinkercad("gear");
  assert.deepEqual(tc.map((m) => m.formats), [["STL", "OBJ"]]);
});

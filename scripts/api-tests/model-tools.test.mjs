import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLib } from "./helpers.mjs";

const { toggleComparison } = loadLib("comparison");
const { alternativeQuery, findAlternatives } = loadLib("modelAlternatives");
const { modelDimensionsFromLd, toModelDimensions } = loadLib("modelDimensions");

const model = (title, url, platform, via) => ({ title, url, platform, via });

test("comparison preserves order, toggles by URL and caps selection at three", () => {
  const candidates = ["a", "b", "c", "d"].map((id) => model(id, `https://site.test/${id}`, "printables"));
  const picks = candidates.reduce(toggleComparison, []);
  assert.deepEqual(picks, candidates.slice(0, 3));
  assert.equal(toggleComparison(picks, candidates[3]), picks);
  assert.deepEqual(toggleComparison(picks, { ...candidates[0], title: "Updated title" }), candidates.slice(1, 3));
});

test("dimensions come only from structured 3D models with three positive, explicitly measured axes", () => {
  const length = (value, unitCode) => ({ "@type": "QuantitativeValue", value, unitCode });
  const product = { "@type": "3DModel", width: length(2, "CMT"), depth: length("1.5", "INH"), height: length(35, "MMT") };
  const image = { ...product, "@type": "ImageObject" };
  const noUnit = { ...product, height: { value: 20 } };
  assert.equal(modelDimensionsFromLd([image, noUnit]), undefined);
  assert.deepEqual(modelDimensionsFromLd([{ "@graph": [image, noUnit, product] }]), { width: 20, depth: 1.5 * 25.4, height: 35 });
  assert.equal(toModelDimensions({ width: 20, depth: 40, height: -1 }), undefined);
});

test("alternative search forms a bounded query from title words, preserving numbered and non-Latin terms", () => {
  assert.equal(alternativeQuery("Fixing Brácket – M8, STL (Free 3D Model)"), "fixing bracket m8");
  assert.equal(alternativeQuery("入れ物 板"), "入れ物 板");
  assert.equal(alternativeQuery("   !!!"), "");
  assert.equal(alternativeQuery("x".repeat(200)).length, 150);
});

test("alternatives favor exact titles and omit the original site, dead links, duplicates and wrong part numbers", () => {
  const original = model("Wall fixing bracket M8", "https://www.printables.com/model/42", "printables");
  const similar = model("Heavy-duty wall fixing bracket M8", "https://grabcad.com/library/bracket", "grabcad");
  const exact = model("Wall fixing bracket M8 STL", "https://thingiverse.com/thing:42", "thingiverse");
  const dead = "https://www.myminifactory.com/object/bracket";
  const results = [
    model(original.title, `${original.url}?utm_source=feed`, "yeggi", "Other"),
    model(original.title, "https://www.yeggi.com/goto/printables", "yeggi", "Printables"),
    model(original.title, "https://www.printables.com/model/1", "printables"),
    model(original.title, `${dead}?gclid=fixture`, "myminifactory"),
    model("Wall fixing bracket M10", "https://thingiverse.com/thing:52", "thingiverse"),
    model("Wall fixing bracket M8 M10", "https://thingiverse.com/thing:53", "thingiverse"),
    model("Kitchen wall shelf", "https://cults3d.com/en/3d-model/home/shelf", "cults3d"),
    similar, exact,
    { ...exact, url: "https://www.thingiverse.com/thing:42/?utm_source=other#files" },
  ];
  assert.deepEqual(findAlternatives(original, results, [dead]), [
    { model: exact, match: "title" }, { model: similar, match: "similar" },
  ]);
});

test("alternative URLs retain product selectors and never return an unsafe scheme", () => {
  const original = model("Sample bearing", "https://grabcad.com/library/bearing", "grabcad");
  const first = model(original.title, "https://www.traceparts.com/els/catalog/goto?Product=A", "traceparts");
  const second = { ...first, url: first.url.replace("=A", "=B") };
  assert.deepEqual(findAlternatives(original, [first, second, { ...first, url: "javascript:foo()" }]), [
    { model: first, match: "title" }, { model: second, match: "title" },
  ]);
});

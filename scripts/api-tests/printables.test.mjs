import assert from "node:assert/strict";
import { test } from "node:test";
import { loadScraper } from "./helpers.mjs";

const { searchPrintables } = loadScraper("printables");
const model = { id: "42", name: "Fixture lamp", slug: "fixture-lamp", likesCount: 12, downloadCount: 9, image: null };
const result = (item) => Response.json({ data: { searchPrints2: { items: [item] } } });

test("Printables obtains formats and license in its existing search request", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.printables.com/graphql/");
    const { query, variables } = JSON.parse(init.body);
    assert.match(query, /otherFiles \{ name \}/);
    assert.match(query, /license \{ name abbreviation \}/);
    assert.deepEqual(variables, { query: "lamp", limit: 30, offset: 30 });
    return result({ ...model, stls: [{ name: "A.STL" }], otherFiles: [null, { name: "Case.stp" }, { name: "Plate.3mf" }, { name: "Instructions.pdf" }], license: { abbreviation: "CC-BY-SA" } });
  });
  const [hit] = await searchPrintables("lamp", 2);
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(hit.formats, ["STL", "STEP", "3MF"]);
  assert.equal(hit.license, "CC-BY-SA");
});

test("Printables keeps basic search available if listing metadata is rejected", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (_url, init) => JSON.parse(init.body).query.includes("otherFiles")
    ? Response.json({ errors: [{ message: "Cannot query field otherFiles" }] }) : result(model));
  const [hit] = await searchPrintables("lamp");
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(hit.title, model.name);
  assert.equal(hit.formats, undefined);
  assert.equal(hit.license, undefined);
});

import assert from "node:assert/strict";
import { loadScraper } from "./helpers.mjs";

const makeronline = {
  query: "benchy",
  async search(query) {
    const { searchMakeronline } = loadScraper("makeronline");
    const first = await searchMakeronline(query);
    const second = await searchMakeronline(query, 2);
    assert.ok(first.length > 0 && second.length > 0);
    const seen = new Set(first.map(({ url }) => url));
    assert.ok(second.some(({ url }) => !seen.has(url)), "page 2 must add new models");
    return [...first, ...second];
  },
};

export default makeronline;

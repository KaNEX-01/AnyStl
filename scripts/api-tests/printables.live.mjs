import { loadScraper } from "./helpers.mjs";

const printables = {
  query: "parametric phone stand",
  async search(query) {
    const results = await loadScraper("printables").searchPrintables(query);
    if (!results.some((model) => model.formats?.includes("STL") && model.license)) {
      throw new Error("Search did not return expected format and license metadata");
    }
    return results;
  },
};

export default printables;

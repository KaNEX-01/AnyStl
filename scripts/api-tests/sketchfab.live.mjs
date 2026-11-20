import { loadScraper } from "./helpers.mjs";

const sketchfab = {
  query: "vase",
  search: (query) => loadScraper("sketchfab").searchSketchfab(query),
};

export default sketchfab;

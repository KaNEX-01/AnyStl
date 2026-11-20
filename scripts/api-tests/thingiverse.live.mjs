import { loadScraper } from "./helpers.mjs";

const thingiverse = {
  tokenEnv: "THINGIVERSE_ACCESS_TOKEN",
  query: "vase",
  search: (query) => loadScraper("thingiverse").searchThingiverseApi(query, 1),
};

export default thingiverse;

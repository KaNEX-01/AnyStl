import { loadScraper } from "./helpers.mjs";

const cgtrader = {
  tokenEnv: "CGTRADER_ACCESS_TOKEN",
  query: "vase",
  search: (query) => loadScraper("cgtrader").searchCgTraderApi(query, 1),
};

export default cgtrader;

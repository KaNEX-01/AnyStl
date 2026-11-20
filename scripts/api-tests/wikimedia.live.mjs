import { loadScraper } from "./helpers.mjs";

const wikimedia = {
  query: "vase",
  search: (query) => loadScraper("wikimedia").searchWikimedia(query),
};

export default wikimedia;

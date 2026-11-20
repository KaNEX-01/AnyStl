import { loadScraper } from "./helpers.mjs";

const polyhaven = {
  query: "chair",
  search: (query) => loadScraper("polyhaven").searchPolyHaven(query),
};

export default polyhaven;

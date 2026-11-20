import { loadScraper } from "./helpers.mjs";

const cults3d = {
  requiredEnv: ["CULTS3D_USERNAME", "CULTS3D_API_KEY"],
  query: "vase",
  search: (query) => loadScraper("cults3d").searchCults3d(query),
};

export default cults3d;

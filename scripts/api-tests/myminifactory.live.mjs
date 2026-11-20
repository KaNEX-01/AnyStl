import { loadScraper } from "./helpers.mjs";

const myminifactory = {
  tokenEnv: "MYMINIFACTORY_API_KEY",
  query: "vase",
  search: (query) => loadScraper("myminifactory").searchMyMiniFactoryApi(query, 1),
};

export default myminifactory;

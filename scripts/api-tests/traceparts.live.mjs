import { loadScraper } from "./helpers.mjs";

const traceparts = {
  requiredEnv: ["TRACEPARTS_API_KEY", "TRACEPARTS_TENANT_UID", "TRACEPARTS_CLASSIFICATION_CODE", "TRACEPARTS_EASYLINK_ID"],
  // The permitted catalog may not contain any given keyword.
  query: "",
  search: (query) => loadScraper("traceparts").searchTraceParts(query),
};

export default traceparts;

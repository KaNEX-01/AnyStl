import { tracePartsConfig } from "../sourceAvailability";
import type { ModelResult } from "../types";
import { finalize, pageOffset, RESULT_LIMIT } from "./common";
import { apiObject, fetchApiJson, providerImage } from "./optionalApi";

const API_BASE = "https://api-gateway.traceparts.com";
const IMAGE_HOSTS = ["cdn-product-content.traceparts.com", "cdn3.traceparts.com", "cdn.traceparts.com"];
const CATALOG_TTL_MS = 60 * 60 * 1000;

type Config = NonNullable<ReturnType<typeof tracePartsConfig>>;
type Product = { code: string; label: string; thumbnail: string; keywords: string };
type Catalog = { key: string; expires: number; products: Promise<Product[]> };
let catalog: Catalog | undefined;

function searchText(text: string) {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function fetchCatalog(config: Config): Promise<Product[]> {
  // Only one catalog request is made per refresh, so no long-lived token is needed.
  const auth = apiObject(await fetchApiJson(`${API_BASE}/v2/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantUid: config.tenantUid, apiKey: config.apiKey }),
  }));
  if (typeof auth?.token !== "string" || !auth.token.trim()) throw new Error("API returned no access token");

  const url = new URL(`${API_BASE}/v2/Search/ProductList`);
  url.searchParams.set("cultureInfo", "en");
  url.searchParams.set("classificationCode", config.classificationCode);
  if (config.categoryCode) url.searchParams.set("categoryCode", config.categoryCode);
  const data = await fetchApiJson(url, { headers: { Authorization: `Bearer ${auth.token}` } });
  if (!Array.isArray(data)) throw new Error("API returned an invalid catalog response");

  const products = new Map<string, Product>();
  for (const value of data) {
    const row = apiObject(value);
    const code = typeof row?.partFamilyCode === "string" ? row.partFamilyCode.trim() : "";
    const label = typeof row?.label === "string" ? row.label.trim() : "";
    if (!code || !label || products.has(code)) continue;
    const vendor = typeof row?.providerCode === "string" ? row.providerCode : "";
    products.set(code, { code, label, thumbnail: providerImage(row?.pictureUrl, IMAGE_HOSTS), keywords: searchText(`${label} ${code} ${vendor}`) });
  }
  if (data.length && !products.size) throw new Error("API returned no usable products");
  return [...products.values()];
}

function getCatalog(config: Config): Promise<Product[]> {
  const key = JSON.stringify(config);
  if (catalog?.key === key && catalog.expires > Date.now()) return catalog.products;
  // Keep a single in-memory snapshot; searches and concurrent callers share it.
  const entry: Catalog = {
    key, expires: Infinity,
    products: fetchCatalog(config).then((products) => {
      entry.expires = Date.now() + CATALOG_TTL_MS;
      return products;
    }).catch((error) => {
      if (catalog === entry) catalog = undefined;
      throw error;
    }),
  };
  catalog = entry;
  return entry.products;
}

export async function searchTraceParts(query: string, pageNo = 1): Promise<ModelResult[]> {
  const config = tracePartsConfig();
  if (!config) return [];
  const products = await getCatalog(config);
  const terms = searchText(query).split(/\s+/).filter(Boolean);
  const offset = pageOffset(pageNo);
  return products.filter((product) => terms.every((term) => product.keywords.includes(term)))
    .slice(offset, offset + RESULT_LIMIT).map((product) => {
      // TraceParts' documented EasyLink product destination; downloads stay on their site.
      const url = new URL(`https://www.traceparts.com/els/${config.easyLinkId}/goto`);
      url.searchParams.set("Product", product.code);
      return finalize({
        title: product.label, url: url.href, thumbnail: product.thumbnail,
        likes: 0, downloads: null, platform: "traceparts",
      });
    });
}

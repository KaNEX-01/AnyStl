import { cults3dCredentials } from "../sourceAvailability";
import type { ModelResult } from "../types";
import { finalize, pageOffset, RESULT_LIMIT } from "./common";
import { apiObject, fetchApiJson, providerImage, providerUrl } from "./optionalApi";

const API_URL = "https://cults3d.com/graphql";
const MODEL_HOSTS = ["cults3d.com", "www.cults3d.com"];
const IMAGE_HOSTS = ["images.cults3d.com", "files.cults3d.com"];
const SEARCH = `query Search($query: String!, $limit: Int!, $offset: Int!) {
  creationsSearchBatch(query: $query, limit: $limit, offset: $offset) {
    results {
      name(locale: EN)
      url(locale: EN)
      shortUrl
      illustrationImageUrl
      likesCount
      downloadsCount
      price(currency: USD) { cents }
    }
  }
}`;

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function toResult(raw: unknown): ModelResult | null {
  const model = apiObject(raw);
  if (typeof model?.name !== "string" || !model.name.trim()) return null;
  const page = providerUrl(model.url, MODEL_HOSTS);
  const short = providerUrl(model.shortUrl, MODEL_HOSTS);
  const url = page && /^\/en\/3d-model\/.+/.test(page.pathname) ? page
    : short && /^\/:\d+$/.test(short.pathname) ? short : null;
  if (!url) return null;
  url.hostname = "cults3d.com";
  url.search = "";
  url.hash = "";

  const cents = count(apiObject(model.price)?.cents);
  return finalize({
    title: model.name.trim(), url: url.href,
    thumbnail: providerImage(model.illustrationImageUrl, IMAGE_HOSTS),
    likes: count(model.likesCount) ?? 0, downloads: count(model.downloadsCount), platform: "cults3d",
    price: cents === null ? undefined : cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)}`,
  });
}

export async function searchCults3d(query: string, pageNo = 1): Promise<ModelResult[]> {
  const credentials = cults3dCredentials();
  if (!credentials) return [];
  const auth = Buffer.from(`${credentials.username}:${credentials.apiKey}`, "utf8").toString("base64");
  const payload = apiObject(await fetchApiJson(API_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: SEARCH, variables: { query, limit: RESULT_LIMIT, offset: pageOffset(pageNo) } }),
  }));
  if (Array.isArray(payload?.errors) && payload.errors.length) throw new Error("API returned GraphQL errors");
  const results = apiObject(apiObject(payload?.data)?.creationsSearchBatch)?.results;
  if (!Array.isArray(results)) throw new Error("API returned an invalid search response");
  const models = results.map(toResult).filter((item): item is ModelResult => item !== null);
  if (results.length && !models.length) throw new Error("API returned no usable models");
  return models;
}

import { ModelResult, Platform } from "../types";
import { fetchJson, finalize, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "blenderkit";
const API_URL = "https://www.blenderkit.com/api/v1/search/";

interface BlenderKitAsset {
  id: string;
  name: string;
  isFree: boolean;
  isPrivate: boolean;
  license?: string | null;
  thumbnailMiddleUrl: string | null;
  thumbnailSmallUrl: string | null;
  ratingsCount: { bookmarks?: number } | null;
  dictParameters: { sexualizedContent?: boolean } | null;
}

interface BlenderKitResponse {
  results: BlenderKitAsset[];
}

function toResult(asset: BlenderKitAsset): ModelResult {
  return finalize({
    title: asset.name,
    url: `https://www.blenderkit.com/asset-gallery-detail/${asset.id}/`,
    thumbnail: asset.thumbnailMiddleUrl || asset.thumbnailSmallUrl || "",
    // Bookmarks are the closest thing BlenderKit shows to likes.
    likes: asset.ratingsCount?.bookmarks || 0,
    downloads: null,
    platform: PLATFORM,
    // Non-free assets need a BlenderKit "Full Plan" subscription.
    price: asset.isFree ? "Free" : "Full Plan",
    formats: ["BLEND"],
    ...(asset.license === "cc_zero" ? { license: "CC0 1.0" } : {}),
  });
}

/** `query` uses BlenderKit's own syntax: filters like `asset_type:model` plus search words. */
async function search(query: string, pageNo: number): Promise<ModelResult[]> {
  const params = new URLSearchParams({ query, page: String(pageNo), page_size: String(RESULT_LIMIT) });
  const data = await fetchJson<BlenderKitResponse>(`${API_URL}?${params}`, {}, "BlenderKit API");
  return (data.results || [])
    .filter((a) => a.name && !a.isPrivate && !a.dictParameters?.sexualizedContent)
    .map(toResult);
}

export function searchBlenderKit(query: string, pageNo = 1): Promise<ModelResult[]> {
  return search(`asset_type:model order:_score ${query}`, pageNo);
}

export function featuredBlenderKit(): Promise<ModelResult[]> {
  return search("asset_type:model order:-score", 1);
}

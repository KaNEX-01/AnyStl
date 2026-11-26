import { ModelResult, Platform } from "../types";
import { fetchJson, finalize, pageOffset, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "sketchfab";
const API_BASE = "https://api.sketchfab.com/v3";
/** The API returns at most this many results per request. */
const MAX_COUNT = 24;

interface SketchfabModel {
  uid: string;
  name: string;
  viewerUrl: string;
  likeCount: number | null;
  thumbnails: { images: Array<{ url: string; width: number }> } | null;
  isDownloadable?: boolean;
  archives?: { glb?: { type?: string }; gltf?: { type?: string }; usdz?: { type?: string } } | null;
  license?: { label?: string } | null;
}

interface SketchfabResponse {
  results: SketchfabModel[];
}

/** Picks the smallest thumbnail that is still at least ~400px wide. */
function pickThumbnail(model: SketchfabModel): string {
  const images = [...(model.thumbnails?.images || [])].sort((a, b) => a.width - b.width);
  return (images.find((img) => img.width >= 400) || images[images.length - 1])?.url || "";
}

function toResult(model: SketchfabModel): ModelResult {
  const formats = model.isDownloadable === true
    ? (["glb", "gltf", "usdz"] as const).filter((format) => model.archives?.[format]?.type === format).map((format) => format.toUpperCase())
    : [];
  const license = model.license?.label?.trim();
  return finalize({
    title: model.name,
    url: model.viewerUrl || `https://sketchfab.com/3d-models/${model.uid}`,
    thumbnail: pickThumbnail(model),
    likes: model.likeCount || 0,
    // Sketchfab doesn't expose download counts publicly.
    downloads: null,
    platform: PLATFORM,
    ...(formats.length ? { formats } : {}),
    ...(license ? { license } : {}),
  });
}

// Only downloadable models are useful here — the rest are view-only.
export async function searchSketchfab(query: string, pageNo = 1): Promise<ModelResult[]> {
  const offset = pageOffset(pageNo);
  const models: SketchfabModel[] = [];
  // The cursor is a plain result offset, so fill our page in <=24-sized chunks.
  while (models.length < RESULT_LIMIT) {
    const count = Math.min(MAX_COUNT, RESULT_LIMIT - models.length);
    const params = new URLSearchParams({
      type: "models",
      q: query,
      downloadable: "true",
      count: String(count),
      cursor: String(offset + models.length),
    });
    const data = await fetchJson<SketchfabResponse>(`${API_BASE}/search?${params}`, {}, "Sketchfab API");
    models.push(...data.results);
    if (data.results.length < count) break;
  }
  return models.map(toResult);
}

export async function featuredSketchfab(): Promise<ModelResult[]> {
  const params = new URLSearchParams({
    staffpicked: "true",
    downloadable: "true",
    sort_by: "-publishedAt",
    count: String(MAX_COUNT),
  });
  const data = await fetchJson<SketchfabResponse>(`${API_BASE}/models?${params}`, {}, "Sketchfab API");
  return data.results.map(toResult);
}

import { ModelResult, Platform } from "../types";
import { fetchJson, finalize, pageOffset, proxied, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "tinkercad";
const API_BASE = "https://api-reader-prd.tinkercad.com/api/opensearch";

interface TinkercadDesign {
  id: string;
  /** Tinkercad stores the design's title in `description`. */
  description: string;
  number_likes: number | null;
  /** Thumbnail sizes — sometimes a JSON string, sometimes already an object. */
  thumbnail_json: string | ThumbnailSet | null;
}

interface TinkercadResponse {
  designs: TinkercadDesign[];
}

interface ThumbnailSet {
  detailThumb?: { url: string };
  filmstrip?: { url: string };
  galleryThumb?: { url: string };
}

function thumbnail(design: TinkercadDesign): string {
  try {
    const raw = design.thumbnail_json;
    const thumbs: ThumbnailSet = typeof raw === "string" ? JSON.parse(raw) : raw || {};
    return thumbs.detailThumb?.url || thumbs.filmstrip?.url || thumbs.galleryThumb?.url || "";
  } catch {
    return "";
  }
}

function toResult(design: TinkercadDesign): ModelResult {
  return finalize({
    title: design.description,
    url: `https://www.tinkercad.com/things/${design.id}`,
    // Tinkercad's image host sometimes refuses cross-site use; proxy it.
    thumbnail: proxied(thumbnail(design)),
    likes: design.number_likes || 0,
    // Tinkercad doesn't publish download counts.
    downloads: null,
    platform: PLATFORM,
    formats: ["STL", "OBJ"],
  });
}

async function query(path: string, params: Record<string, string>, offset = 0): Promise<ModelResult[]> {
  const search = new URLSearchParams({
    offset: String(offset),
    limit: String(RESULT_LIMIT),
    type: "tinkercad",
    ...params,
  });
  const data = await fetchJson<TinkercadResponse>(`${API_BASE}${path}?${search}`, {}, "Tinkercad API");
  return (data.designs || []).filter((d) => d.description).map(toResult);
}

export function searchTinkercad(q: string, pageNo = 1): Promise<ModelResult[]> {
  return query("/designs", { q }, pageOffset(pageNo));
}

export function featuredTinkercad(): Promise<ModelResult[]> {
  return query("/staff_only/designs", { sort: "created", staff_fav: "1" });
}

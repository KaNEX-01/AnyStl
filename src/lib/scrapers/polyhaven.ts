import { ModelResult, Platform } from "../types";
import { fetchJson, finalize, pageOffset, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "polyhaven";
const API_URL = "https://api.polyhaven.com/assets?t=models";

interface PolyHavenAsset {
  name: string;
  tags: string[];
  categories: string[];
  date_published: number;
  download_count: number;
  thumbnail_url: string;
}

// Poly Haven has only a few hundred models and no search endpoint, so the
// whole catalog is fetched once in a while and searched locally.
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
let catalog: { at: number; assets: Array<[string, PolyHavenAsset]> } | null = null;

async function getCatalog(): Promise<Array<[string, PolyHavenAsset]>> {
  if (!catalog || Date.now() - catalog.at > CATALOG_TTL_MS) {
    const data = await fetchJson<Record<string, PolyHavenAsset>>(API_URL, {}, "Poly Haven API");
    catalog = { at: Date.now(), assets: Object.entries(data) };
  }
  return catalog.assets;
}

function toResult([id, asset]: [string, PolyHavenAsset]): ModelResult {
  return finalize({
    title: asset.name,
    url: `https://polyhaven.com/a/${id}`,
    thumbnail: asset.thumbnail_url,
    likes: 0,
    downloads: asset.download_count ?? null,
    platform: PLATFORM,
    price: "Free",
  });
}

/** Every query word must appear in the name, tags or categories. */
export async function searchPolyHaven(query: string, pageNo = 1): Promise<ModelResult[]> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (await getCatalog()).filter(([id, a]) => {
    const haystack = [id, a.name, ...a.tags, ...a.categories].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
  matches.sort((a, b) => b[1].download_count - a[1].download_count);
  const offset = pageOffset(pageNo);
  return matches.slice(offset, offset + RESULT_LIMIT).map(toResult);
}

export async function featuredPolyHaven(): Promise<ModelResult[]> {
  const newest = [...(await getCatalog())].sort((a, b) => b[1].date_published - a[1].date_published);
  return newest.slice(0, RESULT_LIMIT).map(toResult);
}

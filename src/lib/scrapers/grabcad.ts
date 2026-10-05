import { ModelResult, Platform } from "../types";
import { fetchJson, finalize, mergeUnique, pageOffset, pageRange, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "grabcad";
const API_URL = "https://grabcad.com/community/api/v1/models";
/** The API ignores per_page and always returns this many. */
const NATIVE_PAGE_SIZE = 24;

interface GrabCadModel {
  name: string;
  cached_slug: string;
  preview_image: string | null;
  likes_count: number | null;
  downloads_count: number | null;
}

interface GrabCadResponse {
  models: GrabCadModel[];
}

function toResult(model: GrabCadModel): ModelResult {
  return finalize({
    title: model.name,
    url: `https://grabcad.com/library/${model.cached_slug}`,
    // GrabCAD refuses to serve its images to browsers on other sites; use our proxy.
    thumbnail: model.preview_image ? `/api/image?url=${encodeURIComponent(model.preview_image)}` : "",
    likes: model.likes_count || 0,
    downloads: model.downloads_count ?? null,
    platform: PLATFORM,
  });
}

/** Our page `pageNo` (RESULT_LIMIT results), cut out of GrabCAD's fixed 24-result pages. */
async function query(params: Record<string, string>, pageNo = 1): Promise<ModelResult[]> {
  const offset = pageOffset(pageNo);
  const first = Math.floor(offset / NATIVE_PAGE_SIZE) + 1;
  const last = Math.floor((offset + RESULT_LIMIT - 1) / NATIVE_PAGE_SIZE) + 1;
  const pages = await Promise.all(
    pageRange(first, last).map(async (page) => {
      const search = new URLSearchParams({ page: String(page), ...params });
      const data = await fetchJson<GrabCadResponse>(`${API_URL}?${search}`, {}, "GrabCAD API");
      return data.models || [];
    }),
  );
  const start = offset - (first - 1) * NATIVE_PAGE_SIZE;
  // GrabCAD's ordering isn't stable between requests, so adjacent pages can
  // overlap; drop the repeats.
  return mergeUnique([pages.flat().slice(start, start + RESULT_LIMIT).map(toResult)]);
}

export function searchGrabCad(q: string, pageNo = 1): Promise<ModelResult[]> {
  return query({ query: q }, pageNo);
}

export function featuredGrabCad(): Promise<ModelResult[]> {
  return query({ sort: "popular" });
}

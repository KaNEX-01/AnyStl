import { ModelResult, Platform } from "../types";
import { decodeEntities, finalize, mergeUnique, pageRange, parseCount, RESULT_LIMIT, USER_AGENT } from "./common";

const PLATFORM: Platform = "pinshape";
const BASE_URL = "https://pinshape.com";
/** Pinshape listing pages hold ~12 items, so one of our pages spans this many. */
const NATIVE_PAGES_PER_PAGE = 3;

/** Pinshape has no public API; its listing pages are plain server-rendered HTML. */
async function scrapeListing(url: string): Promise<ModelResult[]> {
  const resp = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    throw new Error(`Pinshape returned ${resp.status}`);
  }
  const html = await resp.text();

  const results: ModelResult[] = [];
  const seen = new Set<string>();
  // Each result is a `.card-item`; split on it and parse each chunk.
  for (const card of html.split('class="card card-item').slice(1)) {
    const href = card.match(/href="(\/items\/\d+-[^"]*)"/)?.[1];
    const title = card.match(/<h5 class="card-title[^"]*">\s*([\s\S]*?)\s*<\/h5>/)?.[1];
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);

    const img = card.match(/<img[^>]*\ssrc="([^"]+)"[^>]*class="card-img-top/)?.[1] || "";
    const likes = card.match(/class="likes-count">([^<]*)</)?.[1];
    const downloads = card.match(/bi-download"><\/i>\s*([\d.,]+[kKmM]?)/)?.[1];

    results.push(
      finalize({
        title: decodeEntities(title),
        url: BASE_URL + href,
        thumbnail: img.startsWith("//") ? `https:${img}` : img,
        likes: parseCount(likes),
        downloads: downloads ? parseCount(downloads) : null,
        platform: PLATFORM,
      }),
    );
    if (results.length >= RESULT_LIMIT) break;
  }
  return results;
}

/** Scrapes native listing pages for our page `pageNo` in parallel. */
async function scrapePages(baseUrl: string, pageNo: number): Promise<ModelResult[]> {
  const first = (pageNo - 1) * NATIVE_PAGES_PER_PAGE + 1;
  const pages = await Promise.all(
    pageRange(first, first + NATIVE_PAGES_PER_PAGE - 1).map((n) =>
      scrapeListing(`${baseUrl}${baseUrl.includes("?") ? "&" : "?"}page=${n}`),
    ),
  );
  return mergeUnique(pages);
}

export function searchPinshape(query: string, pageNo = 1): Promise<ModelResult[]> {
  return scrapePages(`${BASE_URL}/items?search=${encodeURIComponent(query)}&search_type=items`, pageNo);
}

// The default listing is ordered by popularity.
export function featuredPinshape(): Promise<ModelResult[]> {
  return scrapePages(`${BASE_URL}/items`, 1);
}

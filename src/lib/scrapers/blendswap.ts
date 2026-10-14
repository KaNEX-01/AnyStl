import { ModelResult, Platform } from "../types";
import { decodeEntities, fetchText, finalize, parseCount } from "./common";

const PLATFORM: Platform = "blendswap";
const BASE_URL = "https://www.blendswap.com";

/** Blend Swap has no API; listing pages are server-rendered HTML. */
async function scrapeListing(url: string): Promise<ModelResult[]> {
  const { status, text: html } = await fetchText(url);
  // A search with no matches answers 404 rather than an empty page.
  if (status === 404) return [];
  if (status !== 200) {
    throw new Error(`Blend Swap returned ${status}`);
  }

  const results: ModelResult[] = [];
  const seen = new Set<string>();
  for (const card of html.split('class="card card-hover').slice(1)) {
    const href = card.match(/href="(\/blend\/\d+)"/)?.[1];
    const title = card.match(/<h3 class="[^"]*">([^<]*)<\/h3>/)?.[1]?.trim();
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);

    const img = card.match(/<img[^>]*\ssrc="([^"]+)"/)?.[1] || "";
    // Stats row: a heart icon then likes, a download icon then downloads.
    const stats = card.slice(card.indexOf("font-mono")).match(/<\/svg>\s*([\d.,]+[kKmM]?)\s*</g) || [];
    const [likes, downloads] = stats.map((s) => parseCount(s.replace(/<\/svg>|</g, "")));

    results.push(
      finalize({
        title: decodeEntities(title),
        url: BASE_URL + href,
        thumbnail: img.startsWith("/") ? BASE_URL + decodeEntities(img) : img,
        likes: likes || 0,
        downloads: downloads ?? null,
        platform: PLATFORM,
        price: "Free",
      }),
    );
  }
  return results;
}

// Search results come as a single page, so there's nothing past page 1.
export async function searchBlendSwap(query: string, pageNo = 1): Promise<ModelResult[]> {
  if (pageNo > 1) return [];
  return scrapeListing(`${BASE_URL}/search?keyword=${encodeURIComponent(query)}`);
}

// The main listing is ordered by popularity.
export function featuredBlendSwap(): Promise<ModelResult[]> {
  return scrapeListing(`${BASE_URL}/3d`);
}

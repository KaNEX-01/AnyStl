import { ModelResult, Platform } from "../types";
import { decodeEntities, finalize, USER_AGENT } from "./common";

const PLATFORM: Platform = "cadnav";
const BASE_URL = "https://www.cadnav.com";

/**
 * CadNav's search box is a Google Custom Search widget, but it has plain
 * HTML tag pages (/3d/<tag>.html). Returns null when the tag doesn't exist.
 */
async function scrapeTagPage(url: string): Promise<ModelResult[] | null> {
  const resp = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`CadNav returned ${resp.status}`);
  }
  const html = await resp.text();

  const results: ModelResult[] = [];
  const seen = new Set<string>();
  for (const card of html.split('<article class="post-item').slice(1)) {
    const href = card.match(/href="(https:\/\/www\.cadnav\.com\/3d-models\/model-\d+\.html)"/)?.[1];
    const title = card.match(/<h2 class="entry-title">\s*<a[^>]*>([^<]*)<\/a>/)?.[1]?.trim();
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    results.push(
      finalize({
        title: decodeEntities(title),
        url: href,
        thumbnail: card.match(/data-bg="([^"]+)"/)?.[1] || "",
        likes: 0,
        downloads: null,
        platform: PLATFORM,
        price: "Free",
      }),
    );
  }
  return results;
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Tag pages are a single page each, so there's nothing past page 1.
export async function searchCadNav(query: string, pageNo = 1): Promise<ModelResult[]> {
  if (pageNo > 1) return [];
  // Try the whole query as a tag, then each word on its own, longest first,
  // until one exists (e.g. "office chair" -> "office-chair", "office", "chair").
  const words = query.split(/\s+/).map(slugify).sort((a, b) => b.length - a.length);
  const candidates = [...new Set([slugify(query), ...words])].filter(Boolean);
  for (const tag of candidates) {
    const results = await scrapeTagPage(`${BASE_URL}/3d/${tag}.html`);
    if (results) return results;
  }
  return [];
}

export async function featuredCadNav(): Promise<ModelResult[]> {
  return (await scrapeTagPage(`${BASE_URL}/3d-models/`)) || [];
}

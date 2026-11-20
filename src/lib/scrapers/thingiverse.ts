import { Page } from "playwright";
import { ModelResult, Platform } from "../types";
import { finalize, mergeUnique, pageRange } from "./common";
import { apiObject, optionalApiSearch, providerImage } from "./optionalApi";

const PLATFORM: Platform = "thingiverse";
/** Thingiverse listing pages hold ~20 things, so one of our pages spans this many. */
const NATIVE_PAGES_PER_PAGE = 2;
/** Match the scraper's two ~20-result listing pages as closely as possible. */
const API_PAGE_SIZE = 40;
const IMAGE_HOSTS = ["cdn.thingiverse.com", "resize.thingiverse.com"];

function apiCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function toApiResult(raw: unknown): ModelResult | null {
  const hit = apiObject(raw);
  const id = hit && apiCount(hit.id);
  const title = typeof hit?.name === "string" ? hit.name.trim() : "";
  if (!hit || !id || !title) return null;

  const result = finalize({
    title,
    url: `https://www.thingiverse.com/thing:${id}`,
    thumbnail: providerImage(hit.thumbnail, IMAGE_HOSTS) || providerImage(hit.preview_image, IMAGE_HOSTS),
    likes: apiCount(hit.like_count) ?? 0,
    downloads: apiCount(hit.download_count),
    platform: PLATFORM,
  });
  if (typeof hit.is_ai === "boolean") result.isAI = hit.is_ai;
  return result;
}

/** A null result asks the caller to scrape. An empty list is a successful search. */
export async function searchThingiverseApi(query: string, pageNo: number): Promise<ModelResult[] | null> {
  const token = process.env.THINGIVERSE_ACCESS_TOKEN?.trim();
  // Dot-only terms would be normalized as URL path segments.
  if (!token || query === "." || query === "..") return null;

  const params = new URLSearchParams({ type: "things", sort: "relevant", page: String(pageNo), per_page: String(API_PAGE_SIZE) });
  const url = `https://api.thingiverse.com/search/${encodeURIComponent(query)}/?${params}`;
  return optionalApiSearch("Thingiverse", url, "hits", toApiResult, { Authorization: `Bearer ${token}` });
}

/** Scrapes native pages for our page `pageNo`, one after another in the same tab. */
async function scrapePages(page: Page, urlForPage: (n: number) => string, pageNo: number) {
  const first = (pageNo - 1) * NATIVE_PAGES_PER_PAGE + 1;
  const lists: ModelResult[][] = [];
  for (const n of pageRange(first, first + NATIVE_PAGES_PER_PAGE - 1)) {
    const results = await scrapeListing(page, urlForPage(n));
    lists.push(results);
    if (results.length === 0) break;
  }
  return mergeUnique(lists);
}

export function searchThingiverse(page: Page, query: string, pageNo = 1): Promise<ModelResult[]> {
  return scrapePages(
    page,
    (n) => `https://www.thingiverse.com/search?q=${encodeURIComponent(query)}&page=${n}&type=things&sort=relevant`,
    pageNo,
  );
}

export function featuredThingiverse(page: Page): Promise<ModelResult[]> {
  return scrapePages(page, (n) => `https://www.thingiverse.com/search?page=${n}&type=things&sort=popular`, 1);
}

/** Scrapes the model cards of any Thingiverse search/listing page. */
async function scrapeListing(page: Page, url: string): Promise<ModelResult[]> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Wait for the actual card content to load (not just the container)
  await page.waitForSelector('.ItemCardHeader__itemCardTitle--TadFI, a[title][href*="thing:"]', {
    timeout: 15_000,
  }).catch(() => {});

  await page.evaluate(() => window.scrollBy(0, 1500));
  await page.waitForTimeout(3000);

  const results = await page.evaluate((platform: Platform) => {
    const items: Array<{
      title: string;
      url: string;
      thumbnail: string;
      likes: number;
      downloads: number | null;
      platform: Platform;
    }> = [];

    const cards = document.querySelectorAll(".item-card-container");
    const seen = new Set<string>();

    for (const card of cards) {
      // Find any link pointing to a thing page
      const allLinks = card.querySelectorAll('a[href*="thing:"]');
      let thingUrl = "";
      for (const link of allLinks) {
        const href = (link as HTMLAnchorElement).href;
        const match = href.match(/\/thing:\d+$/);
        if (match) {
          thingUrl = href;
          break;
        }
      }
      if (!thingUrl) continue;
      if (seen.has(thingUrl)) continue;
      seen.add(thingUrl);

      // Title: from the title link or title attribute
      const titleEl = card.querySelector('[class*="itemCardTitle"]') as HTMLElement | null;
      const title = titleEl?.getAttribute("title") || titleEl?.textContent?.trim() || "";
      if (!title || title.length < 2 || title === "Ad") continue;

      // Thumbnail
      const img = card.querySelector("img[src]") as HTMLImageElement | null;
      const thumbnail = img?.src || "";

      // Likes: the Like button has a .button-content span with the count
      let likes = 0;
      const likeButton = card.querySelector('button[aria-label="Like"]');
      if (likeButton) {
        const countSpan = likeButton.querySelector(".button-content");
        const text = countSpan?.textContent?.trim() || "0";
        const cleaned = text.replace(/,/g, "");
        if (/[kK]$/i.test(cleaned)) likes = Math.round(parseFloat(cleaned) * 1000);
        else if (/[mM]$/i.test(cleaned)) likes = Math.round(parseFloat(cleaned) * 1000000);
        else likes = parseInt(cleaned, 10) || 0;
      }

      items.push({
        title,
        url: thingUrl,
        thumbnail,
        likes,
        downloads: null,
        platform,
      });
    }

    return items;
  }, PLATFORM);

  // Thingiverse images are blocked cross-origin in browsers; serve them via our proxy.
  return results.map((r) =>
    finalize({
      ...r,
      thumbnail: r.thumbnail ? `/api/image?url=${encodeURIComponent(r.thumbnail)}` : "",
    }),
  );
}

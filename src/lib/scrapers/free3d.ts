import { Page } from "playwright";
import { ModelResult, Platform } from "../types";
import { gotoPastChallenge } from "../browser";
import { finalize } from "./common";

const PLATFORM: Platform = "free3d";
const CARD = ".search-result";
// Present on every real Free3D page (the category menu) but not on the bot
// check, so a search with no matches is recognised as loaded-but-empty
// instead of being waited on until it times out.
const PAGE_LOADED = `${CARD}, a[href*="/3d-models/architecture"]`;

// Runs in the headful browser: Free3D shares TurboSquid's DataDome check.
async function scrapeListing(page: Page, url: string): Promise<ModelResult[]> {
  await gotoPastChallenge(page, url, PAGE_LOADED);
  // The first cards show up while the rest of the (large) page is still
  // streaming in; let it finish so the whole list is scraped.
  await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});

  const items = await page.evaluate((selector) => {
    return [...document.querySelectorAll<HTMLElement>(selector)].map((card) => {
      // The title link holds the name; the thumbnail link comes first but is empty.
      const titleLink = card.querySelector<HTMLAnchorElement>(".search-result__title a");
      const link = titleLink || card.querySelector<HTMLAnchorElement>("a[href*='/3d-model/']");
      const img = card.querySelector<HTMLImageElement>("img.search-result__thumb, img");
      const priceEl = card.querySelector<HTMLElement>("[data-price]");
      const price = priceEl ? Number(priceEl.dataset.price) : null;
      const downloads = card.querySelector(".stat-item.downloads")?.textContent?.replace(/[^\d]/g, "") || "";
      return {
        title: (titleLink?.textContent?.trim() || img?.alt?.replace(/ 3d model$/i, "") || "").trim(),
        url: link?.href || "",
        thumbnail: img?.src || "",
        price: price === null || Number.isNaN(price) ? null : price,
        downloads: downloads ? Number(downloads) : null,
      };
    });
  }, CARD);

  const seen = new Set<string>();
  return items
    .filter((i) => i.title && i.url && !seen.has(i.url) && seen.add(i.url))
    .map((i) =>
      finalize({
        title: i.title,
        url: i.url,
        // Browsers get Free3D's images blocked (bot check / untyped), so proxy them.
        thumbnail: i.thumbnail ? `/api/image?url=${encodeURIComponent(i.thumbnail)}` : "",
        likes: 0,
        downloads: i.downloads,
        platform: PLATFORM,
        ...(i.price !== null ? { price: i.price === 0 ? "Free" : `$${i.price}` } : {}),
      }),
    );
}

const slug = (q: string) => encodeURIComponent(q.trim().toLowerCase().replace(/\s+/g, "-"));

// Free3D shows all matches (~100) on one page and has no further pages.
export async function searchFree3d(page: Page, query: string, pageNo = 1): Promise<ModelResult[]> {
  if (pageNo > 1) return [];
  return scrapeListing(page, `https://free3d.com/3d-models/${slug(query)}`);
}

export function featuredFree3d(page: Page): Promise<ModelResult[]> {
  return scrapeListing(page, "https://free3d.com/3d-models/");
}

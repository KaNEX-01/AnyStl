import { Page } from "playwright";
import { ModelResult, Platform } from "../types";
import { gotoPastChallenge } from "../browser";
import { finalize } from "./common";

const PLATFORM: Platform = "turbosquid";
const CARD = '[data-monitor="srp-result-item"]';

// Runs in the headful browser: TurboSquid's DataDome check turns headless away.
async function scrapeListing(page: Page, url: string): Promise<ModelResult[]> {
  await gotoPastChallenge(page, url, CARD);
  // The first cards show up while the rest of the (large) page is still
  // streaming in; let it finish so the whole list is scraped.
  await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});

  const items = await page.evaluate((selector) => {
    return [...document.querySelectorAll<HTMLElement>(selector)].map((card) => {
      const link = card.querySelector<HTMLAnchorElement>('a[href*="/3d-models/"]');
      const img = card.querySelector("img");
      // aria-label is "<id>-<title>".
      const title = (card.getAttribute("aria-label") || "").replace(/^\d+-/, "").trim() || img?.alt || "";
      const price = card.innerText.match(/^\s*(Free|\$[\d,.]+)/im)?.[1] || null;
      return { title, url: link?.href || "", thumbnail: img?.currentSrc || img?.src || "", price };
    });
  }, CARD);

  const seen = new Set<string>();
  return items
    .filter((i) => i.title && i.url && !seen.has(i.url) && seen.add(i.url))
    .map((i) =>
      finalize({
        title: i.title,
        url: i.url,
        thumbnail: i.thumbnail,
        likes: 0,
        downloads: null,
        platform: PLATFORM,
        ...(i.price ? { price: i.price } : {}),
      }),
    );
}

export function searchTurboSquid(page: Page, query: string, pageNo = 1): Promise<ModelResult[]> {
  const base = `https://www.turbosquid.com/Search/3D-Models/${encodeURIComponent(query)}`;
  return scrapeListing(page, pageNo > 1 ? `${base}?page_num=${pageNo}` : base);
}

export function featuredTurboSquid(page: Page): Promise<ModelResult[]> {
  return scrapeListing(page, "https://www.turbosquid.com/Search/3D-Models/free");
}

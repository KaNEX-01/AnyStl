import { Page } from "playwright";
import { ModelResult, Platform } from "../types";
import { gotoPastChallenge } from "../browser";
import { finalize, proxied, RESULT_LIMIT } from "./common";
import { apiObject, optionalApiSearch, providerImage, providerUrl } from "./optionalApi";

const PLATFORM: Platform = "cgtrader";
// Each result card; its data-attributes JSON carries id, title and price.
const CARD = ".card-3d-model[data-attributes]";
const MODEL_HOSTS = ["www.cgtrader.com", "cgtrader.com"];
const IMAGE_HOSTS = ["img-new.cgtrader.com", "media.cgtrader.com"];

function apiModel(raw: unknown): ModelResult | null {
  const model = apiObject(raw);
  if (!model || typeof model.title !== "string" || !model.title.trim()) return null;
  const url = providerUrl(model.url, MODEL_HOSTS);
  if (!url || !/^\/(?:3d-models|3d-print-models|free-3d-models)\/.+/.test(url.pathname)) return null;
  url.search = "";
  url.hash = "";

  const thumbnails = Array.isArray(model.thumbnails) ? model.thumbnails : [];
  const thumbnail = thumbnails.map((image) => providerImage(image, IMAGE_HOSTS)).find(Boolean) || "";
  const amount = apiObject(model.prices)?.download;
  const price = typeof amount === "number" && Number.isFinite(amount) && amount >= 0
    ? (amount === 0 ? "Free" : `$${amount}`)
    : undefined;
  const result = finalize({ title: model.title.trim(), url: url.href, thumbnail, likes: 0, downloads: null, platform: PLATFORM, price });
  if (typeof model.ai_generated === "boolean") result.isAI = model.ai_generated;
  return result;
}

export function searchCgTraderApi(query: string, pageNo: number): Promise<ModelResult[] | null> {
  const token = process.env.CGTRADER_ACCESS_TOKEN?.trim();
  if (!token) return Promise.resolve(null);
  const url = new URL("https://api.cgtrader.com/v1/models");
  url.search = new URLSearchParams({ keywords: query, page: String(pageNo), per_page: String(RESULT_LIMIT), sort: "best_match" }).toString();
  return optionalApiSearch("CGTrader", url, "models", apiModel, { Authorization: `Bearer ${token}` });
}

async function scrapeListing(page: Page, url: string): Promise<ModelResult[]> {
  // The first visit gets an AWS WAF check that clears itself with JS.
  await gotoPastChallenge(page, url, CARD);
  // The first cards show up while the rest of the (large) page is still
  // streaming in; let it finish so the whole list is scraped.
  await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});

  const items = await page.evaluate((selector) => {
    return [...document.querySelectorAll<HTMLElement>(selector)].map((card) => {
      let data: { title?: string; price?: number } = {};
      try {
        data = JSON.parse(card.dataset.attributes || "{}");
      } catch {}
      const link = card.querySelector<HTMLAnchorElement>("a.cgt-model-card__link, a[href*='models/']");
      const img = card.querySelector("img");
      return {
        title: (data.title || img?.alt || "").trim(),
        url: link?.href || "",
        // Prefer the <img> fallback (JPEG) over the <picture>'s WebP source the
        // browser picked: CGTrader serves the WebP untyped, which browsers block.
        thumbnail: img?.src || img?.currentSrc || "",
        price: typeof data.price === "number" ? data.price : null,
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
        // CGTrader's image host is unreliable for cross-site use; proxy it.
        thumbnail: proxied(i.thumbnail),
        // Listing cards don't show likes or downloads.
        likes: 0,
        downloads: null,
        platform: PLATFORM,
        ...(i.price !== null ? { price: i.price === 0 ? "Free" : `$${i.price}` } : {}),
      }),
    );
}

export function searchCgTrader(page: Page, query: string, pageNo = 1): Promise<ModelResult[]> {
  const params = new URLSearchParams({ keywords: query });
  if (pageNo > 1) params.set("page", String(pageNo));
  return scrapeListing(page, `https://www.cgtrader.com/search?${params}`);
}

export function featuredCgTrader(page: Page): Promise<ModelResult[]> {
  return scrapeListing(page, "https://www.cgtrader.com/free-3d-models");
}

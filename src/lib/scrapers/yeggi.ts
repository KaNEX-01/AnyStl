import { Page } from "playwright";
import { ModelResult, Platform } from "../types";
import { gotoPastChallenge } from "../browser";
import { finalize, pageRange, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "yeggi";
/**
 * Yeggi pages scanned per page of our results. One Yeggi page (~60 hits)
 * already yields up to ~50 Cults3D/MyMiniFactory/… models for popular terms.
 */
const PAGES_TO_SCAN = 1;

// Yeggi indexes many sites. The ones AnyStl already searches directly are
// skipped so Yeggi only contributes sites we can't reach ourselves
// (Cults3D, MyMiniFactory, Gambody, …).
const COVERED_SITES = new Set([
  "makerworld",
  "printables",
  "thingiverse",
  "creality cloud",
  "makeronline",
  "sketchfab",
  "grabcad",
  "tinkercad",
  "pinshape",
  "thangs",
  "nexprint",
  "cgtrader",
]);

const SITE_NAMES: Record<string, string> = {
  cults: "Cults3D",
  myminifactory: "MyMiniFactory",
  gambody: "Gambody",
  nexprint: "Nexprint",
  nih: "NIH 3D",
  cgtrader: "CGTrader",
  youmagine: "YouMagine",
  "3dexport": "3DExport",
  turbosquid: "TurboSquid",
};

interface YeggiItem {
  title: string;
  url: string;
  thumbnail: string;
  site: string;
}

async function scrapePage(page: Page, url: string): Promise<YeggiItem[]> {
  await gotoPastChallenge(page, url, ".item_1_A");
  return page.evaluate(() =>
    [...document.querySelectorAll(".item_1_A")].map((item) => {
      const link = item.querySelector<HTMLAnchorElement>('a[href*="/goto/"]');
      const overlay = [...item.querySelectorAll(".img-overlay i")];
      // The first text block is "Tags <title>"; drop the toggle label.
      const text = item.querySelector(".item_3_B_2");
      const toggle = text?.querySelector(".txt_tag_changer_1");
      const title = (text?.textContent || "").replace(toggle?.textContent || "", "").trim();
      return {
        title,
        url: link?.href || "",
        thumbnail: item.querySelector("img")?.src || "",
        site: (overlay[overlay.length - 1]?.textContent || "").trim(),
      };
    }),
  );
}

async function collect(page: Page, urls: string[], limit = Infinity): Promise<ModelResult[]> {
  const results: ModelResult[] = [];
  // Yeggi sometimes lists the same model twice.
  const seen = new Set<string>();
  for (const url of urls) {
    let items: YeggiItem[];
    try {
      items = await scrapePage(page, url);
    } catch (err) {
      // Past the last page of results there are no items to wait for; keep
      // what earlier pages found. Only a failing first page is a real error.
      if (url === urls[0]) throw err;
      break;
    }
    for (const item of items) {
      const site = item.site.toLowerCase();
      if (!item.title || !item.url || COVERED_SITES.has(site) || seen.has(item.url)) continue;
      seen.add(item.url);
      results.push(
        finalize({
          title: item.title,
          url: item.url,
          thumbnail: item.thumbnail,
          // Yeggi doesn't show popularity numbers.
          likes: 0,
          downloads: null,
          platform: PLATFORM,
          via: SITE_NAMES[site] || item.site,
        }),
      );
      if (results.length >= limit) return results;
    }
  }
  return results;
}

// Keeps every match from the scanned pages (no early cut-off) so the next
// page of results picks up exactly where this one ended.
export function searchYeggi(page: Page, query: string, pageNo = 1): Promise<ModelResult[]> {
  const slug = encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, "+")).replace(/%2B/g, "+");
  const first = (pageNo - 1) * PAGES_TO_SCAN + 1;
  const urls = pageRange(first, first + PAGES_TO_SCAN - 1).map((n) =>
    n === 1 ? `https://www.yeggi.com/q/${slug}/` : `https://www.yeggi.com/q/${slug}/${n}/`,
  );
  return collect(page, urls);
}

export function featuredYeggi(page: Page): Promise<ModelResult[]> {
  return collect(page, ["https://www.yeggi.com/popular-3d-models/"], RESULT_LIMIT);
}

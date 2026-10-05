import { Page } from "playwright";
import { ModelResult, Platform } from "../types";
import { gotoPastChallenge } from "../browser";
import { finalize, pageOffset, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "thangs";
const CARD_LINK = 'a[aria-label][href*="/3d-model/"]';

/** Number of distinct models currently rendered. */
function countModels(page: Page): Promise<number> {
  return page.evaluate(
    (selector) =>
      new Set([...document.querySelectorAll<HTMLAnchorElement>(selector)].map((a) => a.href.match(/-(\d+)(?:[?#]|$)/)?.[1]))
        .size,
    CARD_LINK,
  );
}

/**
 * Scrapes results `offset`..`offset + RESULT_LIMIT` of a listing. Thangs
 * ignores page parameters and loads more on scroll, so scroll until enough
 * cards exist (or no more appear).
 */
async function scrapeListing(page: Page, url: string, offset = 0): Promise<ModelResult[]> {
  await gotoPastChallenge(page, url, CARD_LINK);

  const wanted = offset + RESULT_LIMIT;
  let count = await countModels(page);
  for (let stalled = 0; count < wanted && stalled < 3; ) {
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(1200);
    const next = await countModels(page);
    stalled = next > count ? 0 : stalled + 1;
    count = next;
  }

  const items = await page.evaluate(
    ({ selector, limit }) => {
      const modelId = (href: string) => href.match(/-(\d+)(?:[?#]|$)/)?.[1] ?? href;
      const byId = new Map<string, HTMLAnchorElement[]>();
      for (const a of document.querySelectorAll<HTMLAnchorElement>(selector)) {
        const id = modelId(a.href);
        byId.set(id, [...(byId.get(id) || []), a]);
      }

      const out: Array<{ title: string; url: string; thumbnail: string; likes: number; members: boolean }> = [];
      for (const [id, anchors] of byId) {
        const first = anchors[0]!;
        // Climb to the card: the largest ancestor that holds only this model.
        let card: HTMLElement = first;
        while (card.parentElement) {
          const ids = new Set(
            [...card.parentElement.querySelectorAll<HTMLAnchorElement>(selector)].map((a) => modelId(a.href)),
          );
          if (ids.size > 1 || !ids.has(id)) break;
          card = card.parentElement;
        }

        // Thumbnails go through Next's image optimizer; pull out the original URL.
        // The card also holds the designer's avatar; take the image inside the
        // model link (the thumbnail carousel), not the first image found.
        const img =
          card.querySelector<HTMLImageElement>('a[href*="/3d-model/"] img, img[class*="ModelThumbnail"]') ||
          card.querySelector<HTMLImageElement>('img[alt$="3d model"]');
        let thumbnail = img?.currentSrc || img?.src || "";
        const inner = thumbnail.match(/[?&]url=([^&]+)/)?.[1];
        if (inner) thumbnail = decodeURIComponent(inner);

        // The card's text ends with the like count ("…\nBenchy\n430").
        const lastLine = card.innerText.trim().split("\n").pop()?.trim() || "";
        const m = lastLine.match(/^([\d.,]+)\s*([kKmM]?)$/);
        const mult = m?.[2]?.toLowerCase() === "k" ? 1000 : m?.[2]?.toLowerCase() === "m" ? 1_000_000 : 1;
        const likes = m ? Math.round(parseFloat(m[1]!.replace(/,/g, "")) * mult) : 0;

        // Membership-only models carry a "Become a member to download" button.
        const members = !!card.querySelector('[aria-label*="member" i], [class*="Icon_Membership"]');

        out.push({ title: first.getAttribute("aria-label") || "", url: first.href, thumbnail, likes, members });
        if (out.length >= limit) break;
      }
      return out;
    },
    { selector: CARD_LINK, limit: wanted },
  );

  return items
    .slice(offset)
    .filter((i) => i.title)
    .map(({ members, ...i }) =>
      finalize({
        ...i,
        ...(members ? { price: "Members" } : {}),
        // Thangs doesn't show download counts on listing cards.
        downloads: null,
        platform: PLATFORM,
      }),
    );
}

export function searchThangs(page: Page, query: string, pageNo = 1): Promise<ModelResult[]> {
  return scrapeListing(page, `https://thangs.com/search/${encodeURIComponent(query)}?scope=all`, pageOffset(pageNo));
}

export function featuredThangs(page: Page): Promise<ModelResult[]> {
  return scrapeListing(page, "https://thangs.com/");
}

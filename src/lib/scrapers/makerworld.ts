import { Page } from "playwright";
import { ModelResult, Platform } from "../types";
import { finalize, pageOffset, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "makerworld";
const API_PATH = "/api/v1/search-service/select/design2";

interface MakerWorldHit {
  id: number;
  title: string;
  slug: string;
  cover: string;
  likeCount: number;
  downloadCount: number;
}

interface MakerWorldResponse {
  total: number;
  hits: MakerWorldHit[];
}

async function queryApi(page: Page, keyword: string, offset = 0): Promise<ModelResult[]> {
  // Server-side fetches of the API get a Cloudflare 403, but the same request
  // made from inside a real browser on the makerworld.com origin goes through.
  // The page itself may be a challenge screen — we only need its origin.
  const pageUrl = `https://makerworld.com/en/search/models?keyword=${encodeURIComponent(keyword)}`;
  await page.goto(pageUrl, { waitUntil: "commit", timeout: 30_000 });

  const apiUrl = `${API_PATH}?keyword=${encodeURIComponent(keyword)}&limit=${RESULT_LIMIT}&offset=${offset}`;
  const callApi = () =>
    page.evaluate(async (url: string) => {
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      return { status: resp.status, body: await resp.text() };
    }, apiUrl);

  let { status, body } = await callApi();
  if (status === 403) {
    // A fresh session sometimes needs the bot check's cookie first; let the
    // page finish loading so it can set one, then try once more.
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    ({ status, body } = await callApi());
  }
  if (status === 403) {
    // Still refused: the long-lived session's MakerWorld cookies have likely
    // gone stale or been flagged. Drop them and start over once.
    await page.context().clearCookies({ domain: /(^|\.)makerworld\.com$/ });
    await page.goto(pageUrl, { waitUntil: "commit", timeout: 30_000 });
    ({ status, body } = await callApi());
  }

  if (status !== 200) {
    throw new Error(`MakerWorld API returned ${status}`);
  }

  const data: MakerWorldResponse = JSON.parse(body);

  return (data.hits || []).map((hit) =>
    finalize({
      title: hit.title,
      url: `https://makerworld.com/en/models/${hit.id}`,
      thumbnail: hit.cover,
      likes: hit.likeCount || 0,
      downloads: hit.downloadCount || 0,
      platform: PLATFORM,
    }),
  );
}

export function searchMakerWorld(page: Page, query: string, pageNo = 1): Promise<ModelResult[]> {
  return queryApi(page, query, pageOffset(pageNo));
}

// An empty keyword makes the search API return its popular/trending feed.
export function featuredMakerWorld(page: Page): Promise<ModelResult[]> {
  return queryApi(page, "");
}

import { Page } from "playwright";
import { ModelResult, Platform } from "../types";
import { formatsFromNames } from "../modelFormats";
import { finalize, pageOffset, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "makerworld";
const API_ORIGIN = "https://makerworld.com";
const API_PATH = "/api/v1/search-service/select/design2";
const DIRECT_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
};

interface MakerWorldModelFile {
  modelType?: string;
  modelName?: string;
}

interface MakerWorldHit {
  id: number;
  title: string;
  slug: string;
  cover: string;
  likeCount: number;
  downloadCount: number;
  license?: string;
  isAIGC?: boolean;
  designExtension?: {
    model_files?: MakerWorldModelFile[];
  };
}

interface MakerWorldResponse {
  total: number;
  hits: MakerWorldHit[];
}

function extractFormats(hit: MakerWorldHit): string[] {
  const files = hit.designExtension?.model_files;
  if (!Array.isArray(files)) return [];
  const names = files.flatMap((file) => [
    ...(file.modelName ? [file.modelName] : []),
    ...(file.modelType ? [`model.${file.modelType}`] : []),
  ]);
  return formatsFromNames(names);
}

function normalizeLicense(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (/^(?:BY|BY-SA|BY-ND|BY-NC|BY-NC-SA|BY-NC-ND)$/i.test(trimmed)) return `CC ${trimmed.toUpperCase()}`;
  return trimmed;
}

export function mapMakerWorldHits(data: MakerWorldResponse): ModelResult[] {
  return (data.hits || []).map((hit) => {
    const formats = extractFormats(hit);
    const license = normalizeLicense(hit.license);
    const result = finalize({
      title: hit.title,
      url: `https://makerworld.com/en/models/${hit.id}`,
      thumbnail: hit.cover,
      likes: hit.likeCount || 0,
      downloads: hit.downloadCount || 0,
      platform: PLATFORM,
      ...(formats.length ? { formats } : {}),
      ...(license ? { license } : {}),
    });
    if (typeof hit.isAIGC === "boolean") result.isAI = hit.isAIGC;
    return result;
  });
}

/**
 * Direct HTTP JSON call to MakerWorld's search endpoint (~600 ms, no Playwright).
 * Returns null on HTTP/bot-check failure so the caller falls back to Playwright.
 */
export async function searchMakerWorldApi(keyword: string, pageNo = 1): Promise<ModelResult[] | null> {
  const offset = pageOffset(pageNo);
  const url = `${API_ORIGIN}${API_PATH}?keyword=${encodeURIComponent(keyword)}&limit=${RESULT_LIMIT}&offset=${offset}`;
  try {
    const res = await fetch(url, { headers: DIRECT_HEADERS, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as MakerWorldResponse;
    if (!Array.isArray(data?.hits)) return null;
    return mapMakerWorldHits(data);
  } catch {
    return null;
  }
}

async function queryApi(page: Page, keyword: string, offset = 0): Promise<ModelResult[]> {
  // Fallback when direct server-side fetches get a Cloudflare 403: run the same
  // JSON request from inside a real browser on the makerworld.com origin.
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
  return mapMakerWorldHits(data);
}

export function searchMakerWorld(page: Page, query: string, pageNo = 1): Promise<ModelResult[]> {
  return queryApi(page, query, pageOffset(pageNo));
}

// An empty keyword makes the search API return its popular/trending feed.
export async function featuredMakerWorld(page: Page): Promise<ModelResult[]> {
  const direct = await searchMakerWorldApi("", 1);
  if (direct && direct.length > 0) return direct;
  return queryApi(page, "");
}

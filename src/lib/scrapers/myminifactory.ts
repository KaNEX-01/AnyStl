import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ModelResult, Platform } from "../types";
import { fetchText, finalize, pageOffset, RESULT_LIMIT } from "./common";
import { apiObject, optionalApiSearch, providerImage, providerUrl } from "./optionalApi";

const PLATFORM: Platform = "myminifactory";
const SITEMAP_INDEX = "https://www.myminifactory.com/sitemap.xml";
const OBJECT_BASE = "https://www.myminifactory.com/object/";
const MODEL_HOSTS = ["www.myminifactory.com", "myminifactory.com"];
const IMAGE_HOSTS = ["assets.myminifactory.com", "cdn.myminifactory.com"];

// MyMiniFactory's search sits behind an interactive bot check, but its
// sitemaps (published for search engines) list every model's URL, and
// each URL slug holds the model's title. So: download the sitemaps once,
// cache the slugs on disk, and search them locally. Thumbnails are fetched
// separately, on demand (see mmfThumbs.ts); like/download counts aren't
// available this way.
const INDEX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INDEX_FILE = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
  "anystl",
  "myminifactory-objects.txt",
);
const PARALLEL_DOWNLOADS = 4;

// The sitemaps can't tell adult models apart; skip slugs with obvious words.
const ADULT_WORDS = new Set(["nsfw", "nude", "naked", "sexy", "erotic", "hentai", "porn", "topless", "lewd", "18"]);

let slugs: string[] | null = null;
let loading: Promise<string[]> | null = null;

async function fetchSitemap(url: string): Promise<string> {
  const { status, text } = await fetchText(url, { headers: { Accept: "application/xml" }, timeoutMs: 60_000 });
  if (status !== 200) throw new Error(`MyMiniFactory sitemap returned ${status}`);
  return text;
}

async function downloadIndex(): Promise<string[]> {
  const index = await fetchSitemap(SITEMAP_INDEX);
  const sitemaps = [...index.matchAll(/<loc>([^<]*threedobject_sitemap_\d+\.xml)<\/loc>/g)].map((m) => m[1]!);
  if (sitemaps.length === 0) throw new Error("MyMiniFactory sitemap has no model lists");

  const found: string[] = [];
  const queue = [...sitemaps];
  await Promise.all(
    Array.from({ length: PARALLEL_DOWNLOADS }, async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        const xml = await fetchSitemap(url);
        for (const m of xml.matchAll(/<loc>https:\/\/www\.myminifactory\.com\/object\/([^<]+)<\/loc>/g)) {
          found.push(m[1]!);
        }
      }
    }),
  );
  return found;
}

/** Loads the slug list from the disk cache, refreshing it once a week. */
async function loadIndex(): Promise<string[]> {
  try {
    const stat = await fs.stat(INDEX_FILE);
    if (Date.now() - stat.mtimeMs < INDEX_TTL_MS) {
      return (await fs.readFile(INDEX_FILE, "utf8")).split("\n").filter(Boolean);
    }
  } catch {
    // No cache yet.
  }
  const fresh = await downloadIndex();
  await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
  await fs.writeFile(`${INDEX_FILE}.tmp`, fresh.join("\n"));
  await fs.rename(`${INDEX_FILE}.tmp`, INDEX_FILE);
  return fresh;
}

/** The model index; the first call downloads it (~15 s), later calls are instant. */
export function getMyMiniFactoryIndex(): Promise<string[]> {
  if (slugs) return Promise.resolve(slugs);
  loading ??= loadIndex()
    .then((list) => (slugs = list))
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** "3d-print-wave-lamp-shade-136" -> words ["wave", "lamp", "shade"] and id 136. */
function parseSlug(slug: string): { words: string[]; id: number } {
  const parts = slug.split("-");
  const id = Number(parts[parts.length - 1]) || 0;
  const words = parts.slice(parts[0] === "3d" && parts[1] === "print" ? 2 : 0, id ? -1 : undefined);
  return { words, id };
}

function sitemapThumbnail(slug: string): string {
  return `/api/thumb/mmf?slug=${encodeURIComponent(slug)}`;
}

function toResult(slug: string): ModelResult {
  const { words } = parseSlug(slug);
  const title = words.join(" ").replace(/\b\w/g, (c) => c.toUpperCase());
  return finalize({
    title: title || slug,
    url: OBJECT_BASE + slug,
    // Looked up lazily from the model page when the card is shown.
    thumbnail: sitemapThumbnail(slug),
    likes: 0,
    downloads: null,
    platform: PLATFORM,
  });
}

const isClean = (words: string[]) => !words.some((w) => ADULT_WORDS.has(w));

function apiModel(raw: unknown): ModelResult | null {
  const model = apiObject(raw);
  if (!model || typeof model.name !== "string" || !model.name.trim()) return null;
  const url = providerUrl(model.url, MODEL_HOSTS);
  const slug = url?.pathname.match(/^\/object\/([a-z0-9][a-z0-9%-]*)\/?$/i)?.[1];
  if (!slug) return null;

  const images = Array.isArray(model.images) ? model.images.map(apiObject) : [];
  const primary = images.find((image) => image?.is_primary === true);
  const thumbnail = [primary, ...images].map((image) =>
    providerImage(apiObject(image?.standard)?.url, IMAGE_HOSTS) ||
    providerImage(apiObject(image?.thumbnail)?.url, IMAGE_HOSTS),
  ).find(Boolean) || (/^[a-z0-9-]{1,300}$/.test(slug) ? sitemapThumbnail(slug) : "");

  return finalize({
    title: model.name.trim(),
    url: OBJECT_BASE + slug,
    thumbnail,
    likes: typeof model.likes === "number" && Number.isSafeInteger(model.likes) && model.likes >= 0 ? model.likes : 0,
    downloads: null,
    platform: PLATFORM,
    // This endpoint doesn't document a price. Don't claim API listings are free.
    price: "Price unknown",
  });
}

export async function searchMyMiniFactoryApi(query: string, pageNo: number): Promise<ModelResult[] | null> {
  const key = process.env.MYMINIFACTORY_API_KEY?.trim();
  if (!key) return null;
  const url = new URL("https://www.myminifactory.com/api/v2/search");
  url.search = new URLSearchParams({ q: query, page: String(pageNo), per_page: String(RESULT_LIMIT), key }).toString();
  const results = await optionalApiSearch("MyMiniFactory", url, "items", apiModel);
  if (!results) return null;
  const clean = results.filter((model) => isClean(model.title.toLowerCase().split(/[^a-z0-9]+/)) &&
    isClean(parseSlug(model.url.slice(OBJECT_BASE.length)).words));
  // An entirely filtered page isn't proof that later results don't exist.
  return results.length && !clean.length ? null : clean;
}

export async function searchMyMiniFactory(query: string, pageNo = 1): Promise<ModelResult[]> {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (terms.length === 0) return [];

  const matches: Array<{ slug: string; extra: number; id: number }> = [];
  for (const slug of await getMyMiniFactoryIndex()) {
    const { words, id } = parseSlug(slug);
    // Every search word must be a whole word of the title (or a plural of one).
    if (!terms.every((t) => words.some((w) => w === t || w === `${t}s` || w === `${t}es`))) continue;
    if (!isClean(words)) continue;
    matches.push({ slug, extra: words.length - terms.length, id });
  }
  // Tightest titles first (fewest extra words), then newest.
  matches.sort((a, b) => a.extra - b.extra || b.id - a.id);
  const offset = pageOffset(pageNo);
  return matches.slice(offset, offset + RESULT_LIMIT).map((m) => toResult(m.slug));
}

export async function featuredMyMiniFactory(): Promise<ModelResult[]> {
  const newest = (await getMyMiniFactoryIndex())
    .map((slug) => ({ slug, ...parseSlug(slug) }))
    .filter((m) => isClean(m.words))
    .sort((a, b) => b.id - a.id);
  return newest.slice(0, RESULT_LIMIT).map((m) => toResult(m.slug));
}

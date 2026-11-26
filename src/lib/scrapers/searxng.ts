import { ModelResult, Platform } from "../types";
import { fetchJson, finalize, RESULT_LIMIT } from "./common";

interface SiteRule {
  site: string;
  hosts: string[];
  path: RegExp;
  stripTitle: RegExp;
}

/** Sites that normally need Playwright or credentials, searchable via an optional SearXNG instance. */
const SEARXNG_RULES: Partial<Record<Platform, SiteRule>> = {
  makerworld: {
    site: "makerworld.com",
    hosts: ["makerworld.com", "www.makerworld.com"],
    path: /^\/(?:[a-z-]+\/)?models\/\d+/i,
    stripTitle: /\s*(?:\||-|–|—)\s*(?:Free 3D Print Model\s*-\s*)?MakerWorld.*$/i,
  },
  thingiverse: {
    site: "thingiverse.com",
    hosts: ["www.thingiverse.com", "thingiverse.com"],
    path: /^\/thing:\d+/i,
    stripTitle: /\s*(?:by\s+.+?)?\s*-\s*Thingiverse.*$/i,
  },
  thangs: {
    site: "thangs.com",
    hosts: ["thangs.com", "www.thangs.com"],
    path: /\/3d-model\/.+-\d+/i,
    stripTitle: /\s*(?:\||-|–|—)\s*(?:Download free 3D printable.*)?Thangs.*$/i,
  },
  cgtrader: {
    site: "cgtrader.com",
    hosts: ["www.cgtrader.com", "cgtrader.com"],
    path: /^\/(?:3d-models|3d-print-models|free-3d-models)\/.+/i,
    stripTitle: /\s*(?:\||-|–|—)\s*(?:3D model.*)?CGTrader.*$/i,
  },
  cults3d: {
    site: "cults3d.com",
    hosts: ["cults3d.com", "www.cults3d.com"],
    path: /^\/(?:[a-z-]+\/)?3d-model\/.+/i,
    stripTitle: /\s*(?:\||-|–|—|・)\s*(?:Free\s+)?3D.*Cults.*$/i,
  },
  turbosquid: {
    site: "turbosquid.com",
    hosts: ["www.turbosquid.com", "turbosquid.com"],
    path: /^\/3d-models\/.+/i,
    stripTitle: /\s*(?:\||-|–|—)\s*TurboSquid.*$/i,
  },
  free3d: {
    site: "free3d.com",
    hosts: ["free3d.com", "www.free3d.com"],
    path: /^\/3d-model\/.+/i,
    stripTitle: /\s*(?:\||-|–|—)\s*(?:Free\s+)?3D\s*Model.*Free3D.*$/i,
  },
};

export function searxngBaseUrl(): string | null {
  const raw = process.env.SEARXNG_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    parsed.search = "";
    return parsed.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function supportsSearxng(platform: Platform): boolean {
  return platform in SEARXNG_RULES;
}

interface SearxngHit {
  url?: unknown;
  title?: unknown;
  thumbnail?: unknown;
  img_src?: unknown;
}

interface SearxngResponse {
  results?: SearxngHit[];
}

function safeImage(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

/**
 * Searches a single platform through a user-configured SearXNG JSON endpoint.
 * Returns null if SEARXNG_URL is not configured or the platform has no site rule.
 */
export async function searchViaSearxng(platform: Platform, query: string, pageNo = 1): Promise<ModelResult[] | null> {
  const base = searxngBaseUrl();
  const rule = SEARXNG_RULES[platform];
  if (!base || !rule) return null;

  const url = new URL(`${base}/search`);
  url.search = new URLSearchParams({
    q: `site:${rule.site} ${query}`,
    format: "json",
    pageno: String(pageNo),
  }).toString();

  const data = await fetchJson<SearxngResponse>(
    url.href,
    { headers: { Accept: "application/json", "User-Agent": "AnyStl/0.1" } },
    "SearXNG API",
  );
  const hits = Array.isArray(data.results) ? data.results : [];
  const seen = new Set<string>();
  const out: ModelResult[] = [];

  for (const hit of hits) {
    if (typeof hit?.url !== "string" || typeof hit?.title !== "string") continue;
    let parsed: URL;
    try {
      parsed = new URL(hit.url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:" || !rule.hosts.includes(parsed.hostname.toLowerCase())) continue;
    if (!rule.path.test(parsed.pathname)) continue;
    parsed.search = "";
    parsed.hash = "";
    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);

    const title = hit.title.replace(rule.stripTitle, "").trim();
    if (!title) continue;
    out.push(
      finalize({
        title,
        url: parsed.href,
        thumbnail: safeImage(hit.thumbnail) || safeImage(hit.img_src),
        likes: 0,
        downloads: null,
        platform,
      }),
    );
    if (out.length >= RESULT_LIMIT) break;
  }
  return out;
}

import { spawn } from "node:child_process";
import { ModelResult } from "../types";
import { computeScore } from "../scoring";

const AI_RE = /\bAI\b/i;

export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

/** Results per site per page of search results. */
export const RESULT_LIMIT = 30;

/** Offset of the first result on 1-based `pageNo`. */
export function pageOffset(pageNo: number): number {
  return (pageNo - 1) * RESULT_LIMIT;
}

/** The 1-based pages `from`..`to` inclusive. */
export function pageRange(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** Decodes the HTML entities that show up in scraped titles. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Parses counts like "1,234", "5.2k" or "1.1M". */
export function parseCount(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/,/g, "").trim();
  if (/k$/i.test(cleaned)) return Math.round(parseFloat(cleaned) * 1000);
  if (/m$/i.test(cleaned)) return Math.round(parseFloat(cleaned) * 1_000_000);
  return parseInt(cleaned, 10) || 0;
}

/** Concatenates result lists, dropping repeats of the same model URL. */
export function mergeUnique(lists: ModelResult[][]): ModelResult[] {
  const seen = new Set<string>();
  return lists.flat().filter((r) => !seen.has(r.url) && seen.add(r.url));
}

// Some sites refuse to serve thumbnails to browsers on other origins
// (Thingiverse, GrabCAD, Free3D) or send them without an image type, which
// browsers then block (Free3D's preview host), so those are relayed here.
// Only these hosts are allowed so this can't be used as an open proxy.
export const PROXIED_IMAGE_HOSTS = new Set([
  "resize.thingiverse.com",
  "cdn.thingiverse.com",
  "grabcad.com",
  "preview.free3d.com",
  "images.free3d.com",
  // Sends untyped images and, at times, a same-origin resource policy.
  "media.cgtrader.com",
  // Occasionally answers with a same-origin resource policy.
  "csg.tinkercad.com",
]);

/** Routes a thumbnail through AnyStl's image proxy (for hosts browsers get blocked on). */
export function proxied(url: string): string {
  return url ? `/api/image?url=${encodeURIComponent(url)}` : "";
}

/** Adds the derived fields (AI flag, popularity score) to a scraped result. */
export function finalize(result: Omit<ModelResult, "score" | "isAI">): ModelResult {
  return {
    ...result,
    isAI: AI_RE.test(result.title),
    score: computeScore(result),
  };
}

export interface CurlResponse {
  status: number;
  contentType: string;
  body: Buffer;
}

/**
 * Makes a GET/POST request with the curl command-line tool. Some firewalls
 * (CloudFront, Cloudflare) reject Node's own TLS fingerprint outright while
 * letting curl through, so this is the fallback when fetch() gets a 403.
 */
export function curlRequest(
  url: string,
  { method = "GET", headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<CurlResponse> {
  return new Promise((resolve, reject) => {
    const args = ["--silent", "--location", "--max-time", "20", "--user-agent", USER_AGENT, "--request", method];
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== "user-agent") args.push("--header", `${k}: ${v}`);
    }
    if (body !== undefined) args.push("--data-binary", body);
    // Status and type go to stderr so stdout stays the raw (possibly binary) body.
    args.push("--write-out", "%{stderr}%{http_code}\t%{content_type}", url);

    const curl = spawn("curl", args);
    const out: Buffer[] = [];
    let err = "";
    curl.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    curl.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    curl.on("error", reject);
    curl.on("close", (code) => {
      const [status, contentType = ""] = err.trim().split("\t");
      if (code !== 0 || !Number(status)) {
        reject(new Error(`curl failed (exit ${code})`));
        return;
      }
      resolve({ status: Number(status), contentType, body: Buffer.concat(out) });
    });
  });
}

/** fetch() + JSON parse with a browser user agent and a timeout, falling back to curl on a 403. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, label = url): Promise<T> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const resp = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(20_000) });
  if (resp.status === 403) {
    const retry = await curlRequest(url, {
      method: init.method,
      headers,
      body: typeof init.body === "string" ? init.body : undefined,
    }).catch(() => null);
    if (retry && retry.status >= 200 && retry.status < 300) {
      return JSON.parse(retry.body.toString("utf8")) as T;
    }
  }
  if (!resp.ok) {
    throw new Error(`${label} returned ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

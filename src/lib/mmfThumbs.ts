import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { USER_AGENT } from "./scrapers/common";

// MyMiniFactory results come from its sitemaps, which have no images. Each
// model page does name its image (og:image) in the first few KB of HTML,
// so it's looked up only when a card actually shows (lazy <img>), with the
// download cut off as soon as the tag is seen, and the answer kept on disk.
const CACHE_FILE = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
  "anystl",
  "myminifactory-thumbs.json",
);
const OBJECT_BASE = "https://www.myminifactory.com/object/";
const MAX_PARALLEL = 4;
/** Give up if og:image hasn't shown up within this much HTML. */
const MAX_BYTES = 256 * 1024;

let cache: Map<string, string> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const inFlight = new Map<string, Promise<string | null>>();
let active = 0;
const waiting: Array<() => void> = [];

async function loadCache(): Promise<Map<string, string>> {
  if (!cache) {
    try {
      cache = new Map(Object.entries(JSON.parse(await fs.readFile(CACHE_FILE, "utf8"))));
    } catch {
      cache = new Map();
    }
  }
  return cache;
}

/** Writes the cache a moment after the last change, not on every lookup. */
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
      await fs.writeFile(`${CACHE_FILE}.tmp`, JSON.stringify(Object.fromEntries(cache!)));
      await fs.rename(`${CACHE_FILE}.tmp`, CACHE_FILE);
    } catch (err) {
      console.error("Couldn't save MyMiniFactory thumbnail cache:", err);
    }
  }, 2000);
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/**
 * Reads the model page only until its og:image tag appears. Uses curl rather
 * than Node's fetch: Cloudflare turns Node's TLS fingerprint away on these
 * pages but lets curl through. Resolves null when the page has no image and
 * rejects on blocks/network errors (which must not be cached as "no image").
 */
function fetchOgImage(slug: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const curl = spawn("curl", [
      "--silent", "--location", "--fail", "--max-time", "15",
      "--user-agent", USER_AGENT, "--header", "Accept: text/html",
      OBJECT_BASE + slug,
    ]);
    let html = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      curl.kill();
      fn();
    };
    curl.stdout.setEncoding("utf8");
    curl.stdout.on("data", (chunk: string) => {
      html += chunk;
      const match = html.match(/<meta property="og:image" content="([^"]+)"/);
      if (match) finish(() => resolve(match[1]!));
      else if (html.length > MAX_BYTES) finish(() => resolve(null));
    });
    curl.on("error", (err) => finish(() => reject(err)));
    curl.on("close", (code) =>
      finish(() => (code === 0 ? resolve(null) : reject(new Error(`curl exited with ${code}`)))),
    );
  });
}

/** The image URL for a MyMiniFactory model slug, or null if it has none. */
export async function mmfThumbnail(slug: string): Promise<string | null> {
  const known = (await loadCache()).get(slug);
  if (known !== undefined) return known || null;

  let pending = inFlight.get(slug);
  if (!pending) {
    pending = withSlot(() => fetchOgImage(slug))
      .then((url) => {
        // Remember genuine misses too (as ""), so imageless models aren't refetched.
        cache!.set(slug, url || "");
        scheduleSave();
        return url;
      })
      .finally(() => inFlight.delete(slug));
    inFlight.set(slug, pending);
  }
  return pending;
}

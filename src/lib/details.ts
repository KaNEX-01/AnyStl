import { getHeadfulContext, getSharedContext, waitPastChallenge } from "./browser";
import { decodeEntities, fetchJson, fetchText, PROXIED_IMAGE_HOSTS, proxied } from "./scrapers/common";
import { ModelDetails, Platform } from "./types";

// Model pages are read on demand for the quick preview: license, author,
// file types and bigger images. A few sites have a JSON API for this; the
// rest are read from the page's own metadata (OpenGraph / JSON-LD).

const FORMATS = [
  "stl", "3mf", "obj", "step", "stp", "iges", "igs", "f3d", "scad", "fcstd", "sldprt", "blend", "fbx",
  "glb", "gltf", "dae", "skp", "c4d", "ma", "ply", "usdz", "gcode", "bgcode",
];
// File names only ("part-1.stl"): a bare ".stl" is usually an upload widget's
// list of supported formats. Not followed by "(" so code like x.obj() doesn't count.
const FORMAT_RE = new RegExp(`[\\w-]{2,}\\.(${FORMATS.join("|")})(?![\\w(])`, "gi");

/** Formats a site always uses, for sites whose pages don't list files. */
const SITE_FORMATS: Partial<Record<Platform, string[]>> = {
  blenderkit: ["BLEND"],
  blendswap: ["BLEND"],
  polyhaven: ["BLEND", "GLTF", "FBX", "USD"],
  tinkercad: ["STL", "OBJ"],
  warehouse3d: ["SKP"],
};

const CC_NAMES: Record<string, string> = {
  by: "CC BY", "by-sa": "CC BY-SA", "by-nd": "CC BY-ND", "by-nc": "CC BY-NC",
  "by-nc-sa": "CC BY-NC-SA", "by-nc-nd": "CC BY-NC-ND",
};

/** "https://creativecommons.org/licenses/by-nc/4.0/" → "CC BY-NC 4.0". */
export function licenseName(value: string): string {
  const cc = value.match(/creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)/i);
  if (cc && CC_NAMES[cc[1]!.toLowerCase()]) return `${CC_NAMES[cc[1]!.toLowerCase()]} ${cc[2]}`;
  if (/creativecommons\.org\/publicdomain\/zero/i.test(value)) return "CC0";
  if (/gnu\.org\/licenses\/gpl/i.test(value)) return "GPL";
  // Any other link is the site's own terms page.
  if (/^https?:\/\//.test(value)) return "Site license";
  return value.slice(0, 60);
}

function formatsIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(FORMAT_RE)) found.add(m[1]!.toUpperCase().replace("STP", "STEP").replace("IGS", "IGES"));
  return [...found];
}

function meta(html: string, prop: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content) : undefined;
}

/** Walks JSON-LD objects for the first value of `key`. */
function findKey(node: unknown, key: string, depth = 0): unknown {
  if (!node || typeof node !== "object" || depth > 6) return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const v = findKey(n, key, depth + 1);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  if (obj[key] !== undefined) return obj[key];
  for (const v of Object.values(obj)) {
    const found = findKey(v, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function nameOf(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return nameOf(v[0]);
  if (v && typeof v === "object") return nameOf((v as Record<string, unknown>).name);
  return undefined;
}

function fromHtml(url: string, html: string, platform: Platform): ModelDetails {
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].flatMap((m) => {
    try {
      return [JSON.parse(m[1]!)];
    } catch {
      return [];
    }
  });
  const license = nameOf(findKey(ld, "license"));
  const ldImages = findKey(ld, "image");
  const images = [
    meta(html, "og:image"),
    ...(Array.isArray(ldImages) ? ldImages : [ldImages]).map(nameOf).map((v) => (typeof v === "string" ? v : undefined)),
  ].filter((v): v is string => !!v && /^https?:\/\//.test(v));
  const description = meta(html, "og:description") || meta(html, "description") || nameOf(findKey(ld, "description"));

  return {
    url,
    author: nameOf(findKey(ld, "author")) || nameOf(findKey(ld, "creator")) || meta(html, "author"),
    description: description?.slice(0, 600),
    images: [...new Set(images)].slice(0, 6),
    license: license ? licenseName(license) : undefined,
    formats: SITE_FORMATS[platform] || formatsIn(html),
  };
}

const CHALLENGE = /just a moment|attention required|access denied|checking your browser|AwsWafIntegration|not a robot/i;

/** A bot-check page instead of the model: tiny, or a challenge near the top (whole page if small). */
const isChallenge = (html: string) =>
  html.length < 1000 || CHALLENGE.test(html.length < 20_000 ? html : html.slice(0, 3000));

async function fetchHtml(url: string): Promise<string | null> {
  // Anything but a real page (202 is what AWS WAF answers with) is worth a retry with curl.
  const unusable = (status: number, html: string) => status !== 200 || isChallenge(html);
  const { status, text } = await fetchText(url, {
    timeoutMs: 15_000,
    retryIf: (r) => unusable(r.status, r.body.toString("utf8")),
  }).catch(() => ({ status: 0, text: "" }));
  return unusable(status, text) ? null : text;
}

/** Sites whose bot check (DataDome) only lets the visible browser through, as in their scrapers. */
const HEADFUL_PLATFORMS: Platform[] = ["turbosquid", "free3d"];

/** Last resort for sites behind a bot check: load the page in the shared browser. */
async function browserHtml(url: string, platform: Platform): Promise<string> {
  const context = HEADFUL_PLATFORMS.includes(platform) ? await getHeadfulContext() : await getSharedContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitPastChallenge(page, 'meta[property="og:title"], script[type="application/ld+json"]', 20_000);
    return await page.content();
  } finally {
    await page.close().catch(() => {});
  }
}

async function printablesDetails(url: string): Promise<ModelDetails | null> {
  const id = url.match(/\/model\/(\d+)/)?.[1];
  if (!id) return null;
  type Resp = {
    data?: {
      print: {
        summary: string | null;
        user: { publicUsername: string } | null;
        license: { name: string; abbreviation: string | null } | null;
        stls: Array<{ name: string }> | null;
        gcodes: Array<{ name: string }> | null;
        otherFiles: Array<{ name: string }> | null;
        images: Array<{ filePath: string }> | null;
      } | null;
    };
  };
  const data = await fetchJson<Resp>(
    "https://api.printables.com/graphql/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://www.printables.com", Referer: "https://www.printables.com/" },
      body: JSON.stringify({
        query: `query($id: ID!) { print(id: $id) { summary user { publicUsername } license { name abbreviation }
          stls { name } gcodes { name } otherFiles { name } images { filePath } } }`,
        variables: { id },
      }),
    },
    "Printables API",
  );
  const p = data.data?.print;
  if (!p) return null;
  const files = [...(p.stls || []), ...(p.gcodes || []), ...(p.otherFiles || [])].map((f) => ` ${f.name}`).join(" ");
  return {
    url,
    author: p.user?.publicUsername,
    description: p.summary || undefined,
    images: (p.images || []).slice(0, 6).map((i) => `https://media.printables.com/${i.filePath}`),
    license: p.license ? p.license.abbreviation || p.license.name : undefined,
    formats: formatsIn(files),
  };
}

async function sketchfabDetails(url: string): Promise<ModelDetails | null> {
  const uid = url.match(/([0-9a-f]{32})(?:[/?#]|$)/i)?.[1];
  if (!uid) return null;
  type Resp = {
    description?: string;
    user?: { displayName?: string; username?: string };
    license?: { label?: string } | null;
    isDownloadable?: boolean;
    thumbnails?: { images: Array<{ url: string; width: number }> };
  };
  const m = await fetchJson<Resp>(`https://api.sketchfab.com/v3/models/${uid}`, {}, "Sketchfab API");
  const big = [...(m.thumbnails?.images || [])].sort((a, b) => b.width - a.width)[0];
  return {
    url,
    author: m.user?.displayName || m.user?.username,
    description: m.description?.slice(0, 600),
    images: big ? [big.url] : [],
    license: m.license?.label,
    // Downloads come as the original upload plus glTF / USDZ conversions.
    formats: m.isDownloadable ? ["GLTF", "GLB", "USDZ"] : [],
  };
}

async function grabCadDetails(url: string): Promise<ModelDetails | null> {
  const slug = url.match(/grabcad\.com\/library\/([^/?#]+)/)?.[1];
  if (!slug) return null;
  const api = `https://grabcad.com/community/api/v1/models/${slug}`;
  type Model = { raw_description?: string; preview_image?: string | null; author?: { name?: string } };
  type Files = { files?: Array<{ extension?: string }> };
  const [model, files] = await Promise.all([
    fetchJson<Model>(api, {}, "GrabCAD API"),
    fetchJson<Files>(`${api}/files`, {}, "GrabCAD API").catch(() => ({}) as Files),
  ]);
  const exts = (files.files || []).map((f) => ` file.${f.extension || ""}`).join(" ");
  return {
    url,
    author: model.author?.name,
    description: model.raw_description?.slice(0, 600),
    // GrabCAD refuses its images to other sites; go through AnyStl's proxy.
    images: model.preview_image ? [`/api/image?url=${encodeURIComponent(model.preview_image)}`] : [],
    formats: formatsIn(exts),
  };
}

const cache = new Map<string, { at: number; details: ModelDetails }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function getDetails(url: string, platform: Platform): Promise<ModelDetails> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.details;

  let details: ModelDetails | null = null;
  try {
    if (platform === "printables") details = await printablesDetails(url);
    else if (platform === "sketchfab") details = await sketchfabDetails(url);
    else if (platform === "grabcad") details = await grabCadDetails(url);
  } catch {
    // fall back to reading the page
  }
  if (!details) {
    let html = await fetchHtml(url);
    if (!html) html = await browserHtml(url, platform).catch(() => null);
    details = html
      ? fromHtml(url, html, platform)
      : { url, images: [], formats: SITE_FORMATS[platform] || [], error: "The site didn't let AnyStl read this page." };
  }
  // Hosts that refuse images to other sites go through AnyStl's image proxy.
  details.images = details.images.map((src) => {
    try {
      return PROXIED_IMAGE_HOSTS.has(new URL(src).hostname) ? proxied(src) : src;
    } catch {
      return src;
    }
  });
  if (!details.error) cache.set(url, { at: Date.now(), details });
  return details;
}

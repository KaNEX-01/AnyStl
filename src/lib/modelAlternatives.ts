import { PLATFORMS } from "./platforms";
import type { ModelResult } from "./types";

const FILLER = new Set(["a", "an", "the", "and", "for", "with", "3d", "print", "printable", "model", "file", "stl", "3mf", "step", "free"]);

function words(text: string): string[] {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function keywords(text: string): string[] {
  return words(text).filter((word) => !FILLER.has(word));
}

export function alternativeQuery(title: string): string {
  const terms = keywords(title);
  return [...new Set(terms.length ? terms : words(title))].slice(0, 12).join(" ").slice(0, 150).trim();
}

function siteName(model: ModelResult): string {
  return words(model.via || PLATFORMS[model.platform].name).join("");
}

/** Ignore common tracking parameters, but retain product selectors (e.g. TraceParts). */
function linkInfo(raw: string): { site: string; key: string } | null {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    for (const name of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    const site = url.host.replace(/^www\./, "");
    return { site, key: `${site}${url.pathname.replace(/\/$/, "")}${url.search}` };
  } catch {
    return null;
  }
}

export type Alternative = { model: ModelResult; match: "title" | "similar" };

/** Rank title matches; these are suggestions, never proof of identical geometry. */
export function findAlternatives(original: ModelResult, results: ModelResult[], deadUrls: readonly string[] = []): Alternative[] {
  const wanted = keywords(original.title);
  if (!wanted.length) return [];
  const wantedTitle = wanted.join(" ");
  const wantedTerms = new Set(wanted);
  const partCodes = wanted.filter((word) => /\d/.test(word));
  const excluded = new Set([original.url, ...deadUrls].map((url) => linkInfo(url)?.key));
  const originalSite = siteName(original);
  const originalHost = original.platform === "yeggi" ? undefined : linkInfo(original.url)?.site;

  return results.flatMap((model) => {
    const link = linkInfo(model.url);
    if (!link || excluded.has(link.key) || link.site === originalHost || model.platform === original.platform || siteName(model) === originalSite) return [];
    const terms = keywords(model.title);
    const titleMatch = terms.join(" ") === wantedTitle;
    const unique = new Set(terms);
    // Don't suggest a different numbered part (e.g. M8 vs M10). A broader
    // AnyStl search is still available when this conservative filter misses one.
    if (!titleMatch && (partCodes.some((word) => !unique.has(word)) || terms.some((word) => /\d/.test(word) && !wantedTerms.has(word)))) return [];
    const shared = [...wantedTerms].filter((word) => unique.has(word)).length;
    const similarity = shared / (unique.size + wantedTerms.size - shared);
    if (!titleMatch && (shared < 2 || similarity < 0.55)) return [];
    const match: Alternative["match"] = titleMatch ? "title" : "similar";
    return [{ model, key: link.key, match, similarity }];
  }).sort((a, b) => Number(b.match === "title") - Number(a.match === "title") || b.similarity - a.similarity)
    .filter(({ key }) => !excluded.has(key) && excluded.add(key))
    .slice(0, 12)
    .map(({ model, match }) => ({ model, match }));
}

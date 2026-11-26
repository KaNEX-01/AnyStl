import { PLATFORMS } from "./platforms";
import { ModelResult, SavedModel } from "./types";
import type { SavedPatch } from "./savedStore";
import { toModelDimensions } from "./modelDimensions";

function isModelResult(value: unknown): value is ModelResult {
  const m = value as ModelResult;
  return (
    !!m &&
    typeof m.title === "string" &&
    typeof m.url === "string" &&
    /^https?:\/\//.test(m.url) &&
    typeof m.thumbnail === "string" &&
    typeof m.likes === "number" &&
    (m.downloads === null || typeof m.downloads === "number") &&
    m.platform in PLATFORMS
  );
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

function strings(v: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return [...new Set(v.map((s) => str(s, maxLen)).filter((s): s is string => !!s))].slice(0, maxItems);
}

/** A model posted by the client, reduced to the fields AnyStl stores. */
export function toModel(body: unknown): ModelResult | null {
  if (!isModelResult(body)) return null;
  const license = str(body.license, 60);
  const formats = strings(body.formats, 12, 8);
  const dimensions = toModelDimensions(body.dimensions);
  return {
    title: body.title,
    url: body.url,
    thumbnail: body.thumbnail,
    likes: body.likes,
    downloads: body.downloads,
    platform: body.platform,
    ...(typeof body.via === "string" ? { via: body.via.slice(0, 60) } : {}),
    ...(typeof body.price === "string" ? { price: body.price.slice(0, 20) } : {}),
    ...(license ? { license } : {}),
    ...(formats?.length ? { formats } : {}),
    ...(dimensions ? { dimensions } : {}),
    isAI: !!body.isAI,
    score: Number(body.score) || 0,
  };
}

/** The editable fields of a saved model, cleaned up. */
export function toPatch(body: unknown): SavedPatch {
  const b = (body || {}) as Record<string, unknown>;
  const patch: SavedPatch = {};
  if (typeof b.note === "string") patch.note = str(b.note, 2000);
  if (b.collections !== undefined) patch.collections = strings(b.collections, 30, 40) || [];
  if (typeof b.license === "string") patch.license = str(b.license, 60);
  if (b.formats !== undefined) patch.formats = strings(b.formats, 12, 8) || [];
  return patch;
}

/** A saved model from an export file, or null if it isn't one. */
export function toSavedModel(value: unknown): SavedModel | null {
  const model = toModel(value);
  if (!model) return null;
  const v = value as Record<string, unknown>;
  return {
    ...model,
    savedAt: typeof v.savedAt === "number" ? v.savedAt : Date.now(),
    ...toPatch(v),
  };
}

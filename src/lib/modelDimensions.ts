/** A model's source-reported bounding size, converted to millimeters. */
export type ModelDimensions = { width: number; depth: number; height: number };

const MILLIMETERS: Record<string, number> = { MMT: 1, CMT: 10, MTR: 1000, INH: 25.4 };

function lengthMm(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return;
  const { value: amount, unitCode } = value as Record<string, unknown>;
  const number = typeof amount === "string" && /^\d+(?:\.\d+)?$/.test(amount) ? Number(amount) : amount;
  const scale = typeof unitCode === "string" && Object.prototype.hasOwnProperty.call(MILLIMETERS, unitCode) ? MILLIMETERS[unitCode] : undefined;
  if (typeof number !== "number" || !scale) return;
  const mm = number * scale;
  return Number.isFinite(mm) && mm > 0 ? mm : undefined;
}

export function toModelDimensions(value: unknown): ModelDimensions | undefined {
  if (!value || typeof value !== "object") return;
  const { width, depth, height } = value as Record<string, unknown>;
  const valid = (number: unknown): number is number => typeof number === "number" && Number.isFinite(number) && number > 0;
  if (valid(width) && valid(depth) && valid(height)) return { width, depth, height };
}

/** Only explicit dimensions on a structured 3D model, never image or packaging sizes. */
export function modelDimensionsFromLd(nodes: unknown[]): ModelDimensions | undefined {
  for (const node of nodes.flatMap((item) => {
    const graph = item && typeof item === "object" ? (item as Record<string, unknown>)["@graph"] : null;
    return Array.isArray(graph) ? graph : item;
  })) {
    if (!node || typeof node !== "object") continue;
    const data = node as Record<string, unknown>;
    const types = Array.isArray(data["@type"]) ? data["@type"] : [data["@type"]];
    if (!types.some((type) => type === "3DModel" || type === "https://schema.org/3DModel")) continue;
    const width = lengthMm(data.width);
    const depth = lengthMm(data.depth);
    const height = lengthMm(data.height);
    if (width && depth && height) return { width, depth, height };
  }
}

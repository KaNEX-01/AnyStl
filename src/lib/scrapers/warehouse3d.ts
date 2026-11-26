import { ModelResult, Platform } from "../types";
import { fetchJson, finalize, pageOffset, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "warehouse3d";
const API_URL = "https://3dwarehouse.sketchup.com/warehouse/v1.0/entities";
const FILE_BINARIES = [["source_skp", "SKP"], ["glb", "GLB"], ["usdz", "USDZ"]] as const;

interface WarehouseEntity {
  id: string;
  title: string;
  downloads: number | null;
  reviewCount: number | null;
  isPrivate: boolean;
  /** Rendered previews and model files, keyed by name ("bot_lt" = large thumbnail). */
  binaries: Record<string, { contentUrl?: string }> | null;
}

interface WarehouseResponse {
  entries: WarehouseEntity[];
}

function thumbnail(entity: WarehouseEntity): string {
  const binaries = entity.binaries || {};
  const key =
    ["bot_lt", "bot_st"].find((k) => binaries[k]?.contentUrl) ||
    Object.keys(binaries).find((k) => k.startsWith("bot_") && binaries[k]?.contentUrl);
  return key ? binaries[key]!.contentUrl! : "";
}

async function query(params: Record<string, string>, pageNo: number): Promise<ModelResult[]> {
  const search = new URLSearchParams({
    contentType: "3dw",
    count: String(RESULT_LIMIT),
    offset: String(pageOffset(pageNo)),
    // Includes the thumbnail URLs in the same response.
    showBinaryMetadata: "true",
    ...params,
  });
  const data = await fetchJson<WarehouseResponse>(`${API_URL}?${search}`, {}, "3D Warehouse API");
  return (data.entries || [])
    .filter((e) => e.title && !e.isPrivate)
    .map((e) =>
      finalize({
        title: e.title,
        url: `https://3dwarehouse.sketchup.com/model/${e.id}`,
        thumbnail: thumbnail(e),
        likes: e.reviewCount || 0,
        downloads: e.downloads ?? null,
        platform: PLATFORM,
        price: "Free",
        formats: FILE_BINARIES.flatMap(([key, format]) => e.binaries?.[key]?.contentUrl ? [format] : []),
      }),
    );
}

export function searchWarehouse3d(q: string, pageNo = 1): Promise<ModelResult[]> {
  return query({ q }, pageNo);
}

export function featuredWarehouse3d(): Promise<ModelResult[]> {
  return query({ sortBy: "popularity DESC" }, 1);
}

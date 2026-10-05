import { ModelResult, Platform } from "../types";
import { fetchJson, finalize, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "nexprint";
const API_BASE = "https://www.nexprint.com/gateway/api/v1/model-library-server/model-base-info";

interface NexprintModel {
  modelId: string;
  modelName: string;
  coverImgUrl: string | null;
  nsfw: boolean;
  statistics?: {
    staticsModelStarPeoPleCount?: number;
    staticsModelDownloadCount?: number;
  } | null;
}

interface NexprintResponse<T> {
  code: number;
  msg: string;
  data?: { pageResult?: { list: T[] }; list?: T[] };
}

async function get<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const search = new URLSearchParams({ pageSize: String(RESULT_LIMIT), pageNo: "1", ...params });
  const data = await fetchJson<NexprintResponse<T>>(`${API_BASE}${path}?${search}`, {}, "Nexprint API");
  if (data.code !== 0) {
    throw new Error(`Nexprint API error: ${data.msg || data.code}`);
  }
  return data.data?.pageResult?.list || data.data?.list || [];
}

// The API doesn't always honor pageSize, so trim to our limit.
function toResults(models: NexprintModel[]): ModelResult[] {
  return models
    .filter((m) => m.modelName && !m.nsfw)
    .slice(0, RESULT_LIMIT)
    .map((m) =>
      finalize({
        title: m.modelName,
        url: `https://www.nexprint.com/en/models/${m.modelId}`,
        thumbnail: m.coverImgUrl || "",
        likes: m.statistics?.staticsModelStarPeoPleCount || 0,
        downloads: m.statistics?.staticsModelDownloadCount ?? null,
        platform: PLATFORM,
      }),
    );
}

export async function searchNexprint(query: string, pageNo = 1): Promise<ModelResult[]> {
  // sortType 6 is the site's default "relevance" ordering.
  return toResults(
    await get<NexprintModel>("/search", { keyword: query, sortType: "6", pageNo: String(pageNo) }),
  );
}

export async function featuredNexprint(): Promise<ModelResult[]> {
  // The recommendation feed mixes models with collections and articles.
  const items = await get<{ contentType: unknown; model: NexprintModel | null }>("/recommend/web", {});
  return toResults(items.flatMap((i) => (i.model ? [i.model] : [])));
}

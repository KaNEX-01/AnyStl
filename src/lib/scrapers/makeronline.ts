import { ModelResult, Platform } from "../types";
import { fetchJson, finalize, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "makeronline";
const API_BASE = "https://makeronline.com/api";

interface MakeronlineModel {
  mold_id: number;
  title: string;
  mold_image: string;
  like_num: number | null;
  download_num: number | null;
  target_url: string;
}

interface MakeronlineResponse<T> {
  code: number;
  message: string;
  data: T;
}

async function post<T>(path: string, body: object): Promise<T> {
  const data = await fetchJson<MakeronlineResponse<T>>(
    `${API_BASE}${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", lang: "en" },
      body: JSON.stringify(body),
    },
    "Makeronline API",
  );
  if (data.code !== 0) {
    throw new Error(`Makeronline API error: ${data.message}`);
  }
  return data.data;
}

function toResult(model: MakeronlineModel): ModelResult {
  return finalize({
    title: model.title,
    url: model.target_url || `https://www.makeronline.com/model/x/${model.mold_id}.html`,
    thumbnail: model.mold_image,
    likes: model.like_num || 0,
    downloads: model.download_num ?? null,
    platform: PLATFORM,
  });
}

export async function searchMakeronline(query: string, pageNo = 1): Promise<ModelResult[]> {
  const data = await post<{ data: MakeronlineModel[] }>("/search/model", {
    page: pageNo,
    page_size: RESULT_LIMIT,
    keyword: query,
    print_type: "0",
    search: 1,
  });
  return (data.data || []).map(toResult);
}

export async function featuredMakeronline(): Promise<ModelResult[]> {
  const list = await post<MakeronlineModel[]>("/index/recommend-trending/v2.5", {
    is_first: 1,
    page: 1,
    page_size: RESULT_LIMIT,
    seed: String(Date.now()),
    print_type: 0,
    exclude_ids: [],
  });
  return (list || []).map(toResult);
}

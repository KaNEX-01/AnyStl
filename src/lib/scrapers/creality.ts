import { randomUUID } from "node:crypto";
import { ModelResult, Platform } from "../types";
import { fetchJson, finalize, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "creality";
const API_BASE = "https://www.crealitycloud.com/api/cxy";

interface CrealityModel {
  id: string;
  groupName: string;
  likeCount: number | null;
  downloadCount: number | null;
  covers: Array<{ url: string }> | null;
}

interface CrealityResponse<T> {
  code: number;
  msg: string;
  result?: { list: T[] | null };
}

// The API rejects requests that don't carry the web client's identity headers.
function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    __cxy_app_id_: "cxy-gen2",
    __cxy_platform_: "2",
    __cxy_brand_: "creality",
    __cxy_app_ver_: "7.3.28",
    __cxy_os_lang_: "0",
    __cxy_os_ver_: "Linux",
    __cxy_timezone_: "0",
    __cxy_token_: "",
    __cxy_uid_: "",
    __cxy_duid_: randomUUID(),
    __cxy_requestid_: randomUUID(),
  };
}

async function post<T>(path: string, body: object): Promise<T[]> {
  const data = await fetchJson<CrealityResponse<T>>(
    `${API_BASE}${path}`,
    { method: "POST", headers: headers(), body: JSON.stringify(body) },
    "Creality API",
  );
  if (data.code !== 0) {
    throw new Error(`Creality API error: ${data.msg}`);
  }
  return data.result?.list || [];
}

function toResult(model: CrealityModel): ModelResult {
  return finalize({
    title: model.groupName,
    url: `https://www.crealitycloud.com/model-detail/${model.id}`,
    thumbnail: model.covers?.[0]?.url || "",
    likes: model.likeCount || 0,
    downloads: model.downloadCount ?? null,
    platform: PLATFORM,
  });
}

export async function searchCreality(query: string, pageNo = 1): Promise<ModelResult[]> {
  const list = await post<CrealityModel>("/smart_search/v1/model", {
    page: pageNo,
    pageSize: RESULT_LIMIT,
    keyword: query,
  });
  return list.map(toResult);
}

export async function featuredCreality(): Promise<ModelResult[]> {
  // The recommendation feed errors out for small page sizes, so ask for 20.
  const list = await post<{ model: CrealityModel | null }>("/v3/model/recommendv4", {
    cursor: "",
    limit: 20,
  });
  return list.flatMap((item) => (item.model ? [toResult(item.model)] : []));
}

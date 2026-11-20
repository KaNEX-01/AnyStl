import { commonsStlQuery } from "../platforms";
import type { ModelResult } from "../types";
import { finalize, pageOffset, RESULT_LIMIT } from "./common";
import { apiObject, fetchApiJson, providerImage, providerUrl } from "./optionalApi";

const API_URL = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "AnyStl/0.1 (https://github.com/KaNEX-01/AnyStl)";
const IMAGE_HOSTS = ["upload.wikimedia.org", "thumb.wikimedia.org"];

function toResult(raw: unknown): { index: number; result: ModelResult } | null {
  const page = apiObject(raw);
  if (page?.ns !== 6 || typeof page.title !== "string" || !/^File:.+\.stl$/i.test(page.title)) return null;
  const image = apiObject(Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined);
  const url = providerUrl(image?.descriptionurl, ["commons.wikimedia.org"]);
  if (!url || !/^\/wiki\/File:.+\.stl$/i.test(url.pathname)) return null;
  url.search = "";
  url.hash = "";
  return {
    index: typeof page.index === "number" ? page.index : Infinity,
    result: finalize({
      title: page.title.slice(5, -4).replace(/_/g, " ").trim(), url: url.href,
      thumbnail: providerImage(image?.thumburl, IMAGE_HOSTS),
      likes: 0, downloads: null, platform: "wikimedia", price: "Free",
    }),
  };
}

export async function searchWikimedia(query: string, pageNo = 1): Promise<ModelResult[]> {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    action: "query", generator: "search", gsrnamespace: "6", gsrsearch: commonsStlQuery(query),
    gsrlimit: String(RESULT_LIMIT), gsroffset: String(pageOffset(pageNo)),
    prop: "imageinfo", iiprop: "url", iiurlwidth: "400", format: "json", formatversion: "2",
  }).toString();
  const payload = apiObject(await fetchApiJson(url, { headers: { "User-Agent": USER_AGENT } }));
  if (!payload || payload.error || payload.errors) throw new Error("API returned a search error");
  // An empty generator result contains only batchcomplete, with no query object.
  if (payload.batchcomplete === true && !payload.continue && payload.query === undefined) return [];
  const pages = apiObject(payload.query)?.pages;
  if (!Array.isArray(pages)) throw new Error("API returned an invalid search response");
  return pages.map(toResult).filter((item) => item !== null)
    .sort((a, b) => a.index - b.index).map(({ result }) => result);
}

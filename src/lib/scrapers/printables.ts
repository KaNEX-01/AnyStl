import { ModelResult, Platform } from "../types";
import { formatsFromNames } from "../modelFormats";
import { fetchJson, finalize, pageOffset, RESULT_LIMIT } from "./common";

const PLATFORM: Platform = "printables";
const API_URL = "https://api.printables.com/graphql/";
const MEDIA_URL = "https://media.printables.com/";

// The website sits behind a bot-check interstitial, so query the GraphQL
// API the site itself uses instead of scraping the DOM.
const MODEL_FIELDS = `
  id
  name
  slug
  likesCount
  downloadCount
  image { filePath }
`;

const SEARCH_METADATA = `
  stls { name }
  gcodes { name }
  otherFiles { name }
  license { name abbreviation }
`;

const searchQuery = (metadata: string) => `
  query SearchModels($query: String!, $limit: Int!, $offset: Int!) {
    searchPrints2(query: $query, limit: $limit, offset: $offset) {
      items { ${MODEL_FIELDS} ${metadata} }
    }
  }
`;

// Same feed as printables.com/model sorted by "Trending" (most likes this week).
const TRENDING_QUERY = `
  query TrendingModels($limit: Int!, $ordering: String) {
    morePrints(limit: $limit, ordering: $ordering) {
      items { ${MODEL_FIELDS} }
    }
  }
`;

interface PrintablesItem {
  id: string;
  name: string;
  slug: string;
  likesCount: number | null;
  downloadCount: number | null;
  image: { filePath: string } | null;
  stls?: Array<{ name: string } | null> | null;
  gcodes?: Array<{ name: string } | null> | null;
  otherFiles?: Array<{ name: string } | null> | null;
  license?: { name: string; abbreviation: string | null } | null;
}

interface PrintablesResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

class PrintablesQueryError extends Error {}

async function graphql<T>(query: string, variables: object): Promise<T> {
  const data = await fetchJson<PrintablesResponse<T>>(
    API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www.printables.com",
        Referer: "https://www.printables.com/",
      },
      body: JSON.stringify({ query, variables }),
    },
    "Printables API",
  );
  if (data.errors?.length || !data.data) {
    throw new PrintablesQueryError(`Printables API error: ${data.errors?.[0]?.message ?? "empty response"}`);
  }
  return data.data;
}

function toResult(item: PrintablesItem): ModelResult {
  const files = [...(item.stls || []), ...(item.gcodes || []), ...(item.otherFiles || [])];
  const formats = formatsFromNames(files.flatMap((file) => typeof file?.name === "string" ? [file.name] : []));
  const license = item.license?.abbreviation?.trim() || item.license?.name?.trim();
  return finalize({
    title: item.name,
    url: `https://www.printables.com/model/${item.id}-${item.slug}`,
    thumbnail: item.image?.filePath ? MEDIA_URL + item.image.filePath : "",
    likes: item.likesCount || 0,
    downloads: item.downloadCount ?? null,
    platform: PLATFORM,
    ...(formats.length ? { formats } : {}),
    ...(license ? { license } : {}),
  });
}

export async function searchPrintables(query: string, pageNo = 1): Promise<ModelResult[]> {
  type SearchData = { searchPrints2: { items: PrintablesItem[] } | null };
  const variables = { query, limit: RESULT_LIMIT, offset: pageOffset(pageNo) };
  const data = await graphql<SearchData>(searchQuery(SEARCH_METADATA), variables).catch((error) => {
    if (!(error instanceof PrintablesQueryError)) throw error;
    // Search still works if Printables removes a metadata field from the listing API.
    return graphql<SearchData>(searchQuery(""), variables);
  });
  return (data.searchPrints2?.items || []).map(toResult);
}

export async function featuredPrintables(): Promise<ModelResult[]> {
  const data = await graphql<{ morePrints: { items: PrintablesItem[] } | null }>(TRENDING_QUERY, {
    limit: RESULT_LIMIT,
    ordering: "-likes_count_7_days",
  });
  return (data.morePrints?.items || []).map(toResult);
}

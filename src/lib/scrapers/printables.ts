import { ModelResult, Platform } from "../types";
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

const SEARCH_QUERY = `
  query SearchModels($query: String!, $limit: Int!, $offset: Int!) {
    searchPrints2(query: $query, limit: $limit, offset: $offset) {
      items { ${MODEL_FIELDS} }
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
}

interface PrintablesResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

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
    throw new Error(`Printables API error: ${data.errors?.[0]?.message ?? "empty response"}`);
  }
  return data.data;
}

function toResult(item: PrintablesItem): ModelResult {
  return finalize({
    title: item.name,
    url: `https://www.printables.com/model/${item.id}-${item.slug}`,
    thumbnail: item.image?.filePath ? MEDIA_URL + item.image.filePath : "",
    likes: item.likesCount || 0,
    downloads: item.downloadCount ?? null,
    platform: PLATFORM,
  });
}

export async function searchPrintables(query: string, pageNo = 1): Promise<ModelResult[]> {
  const data = await graphql<{ searchPrints2: { items: PrintablesItem[] } | null }>(SEARCH_QUERY, {
    query,
    limit: RESULT_LIMIT,
    offset: pageOffset(pageNo),
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

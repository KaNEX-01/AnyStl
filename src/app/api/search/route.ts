import { NextRequest, NextResponse } from "next/server";
import { PLATFORMS } from "@/lib/platforms";
import { Platform, SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchAll } = await import("@/lib/scrapers");
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ error: "Missing query parameter 'q'" }, { status: 400 });
  }

  const page = Math.min(Math.max(Number(request.nextUrl.searchParams.get("page")) || 1, 1), 50);
  // Optional comma-separated subset of sources (the client drops exhausted ones).
  const sourcesParam = request.nextUrl.searchParams.get("sources");
  const sources = sourcesParam
    ?.split(",")
    .filter((p): p is Platform => p in PLATFORMS);

  try {
    const { results, errors, exhausted, failed } = await searchAll(query, page, sources);
    const response: SearchResponse = {
      query,
      page,
      results,
      exhausted,
      failed,
    };
    if (errors.length > 0) response.errors = errors;
    return NextResponse.json(response);
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json(
      { error: `Search failed: ${error}` },
      { status: 500 }
    );
  }
}

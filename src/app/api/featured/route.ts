import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { featuredAll } = await import("@/lib/scrapers");
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";

  try {
    return NextResponse.json(await featuredAll(refresh));
  } catch (error) {
    console.error("Featured fetch failed:", error);
    return NextResponse.json({ error: `Featured fetch failed: ${error}` }, { status: 500 });
  }
}

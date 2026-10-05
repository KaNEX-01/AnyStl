import { NextRequest, NextResponse } from "next/server";
import { SLICER_PLATFORMS } from "@/lib/platforms";
import { Platform } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Finds a model's print files and answers with the orcaslicer:// link that opens them. */
export async function GET(request: NextRequest) {
  const { prepareForSlicer } = await import("@/lib/slicer");
  const params = request.nextUrl.searchParams;
  const url = params.get("url") || "";
  const platform = params.get("platform") as Platform;
  if (!/^https:\/\//.test(url) || !SLICER_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Missing or unsupported 'url' / 'platform'" }, { status: 400 });
  }
  try {
    const file = await prepareForSlicer(url, platform, params.get("title") || "model");
    const fileUrl = new URL(file.url, request.nextUrl.origin).href;
    return NextResponse.json({ link: `orcaslicer://open?file=${encodeURIComponent(fileUrl)}`, count: file.count });
  } catch (error) {
    console.error("Slicer:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

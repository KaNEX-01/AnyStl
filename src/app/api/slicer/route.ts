import { NextRequest, NextResponse } from "next/server";
import { SLICER_PLATFORMS } from "@/lib/platforms";
import { buildSlicerLink, isSlicerId, SLICERS } from "@/lib/settings";
import { getSettings } from "@/lib/settingsStore";
import { Platform } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Finds a model's print files and answers with the configured slicer URI or direct download URL. */
export async function GET(request: NextRequest) {
  const { prepareForSlicer } = await import("@/lib/slicer");
  const params = request.nextUrl.searchParams;
  const url = params.get("url") || "";
  const platform = params.get("platform") as Platform;
  const requestedSlicer = params.get("slicer");
  if (!/^https:\/\//.test(url) || !SLICER_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Missing or unsupported 'url' / 'platform'" }, { status: 400 });
  }
  const slicer = isSlicerId(requestedSlicer) ? requestedSlicer : (await getSettings()).slicer;
  try {
    const file = await prepareForSlicer(url, platform, params.get("title") || "model");
    const fileUrl = new URL(file.url, request.nextUrl.origin).href;
    const link = buildSlicerLink(slicer, fileUrl);
    return NextResponse.json({
      link,
      fileUrl,
      slicer,
      slicerName: SLICERS[slicer].shortName,
      mode: link ? "protocol" : "download",
      count: file.count,
    });
  } catch (error) {
    console.error("Slicer:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

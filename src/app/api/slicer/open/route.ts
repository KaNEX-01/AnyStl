import { NextRequest, NextResponse } from "next/server";
import { SLICER_PLATFORMS } from "@/lib/platforms";
import { isLoopbackHost, isLoopbackOrigin, openInDesktopSlicer } from "@/lib/slicerOpen";
import { Platform } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Prepares a supported model's print files and dispatches the resulting
 * `orcaslicer://open?file=...` URI through the host OS handler.
 * Restricted to loopback JSON POST requests so third-party pages cannot trigger it.
 */
export async function POST(request: NextRequest) {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  if (!isLoopbackHost(host) || (origin !== null && !isLoopbackOrigin(origin))) {
    return NextResponse.json({ error: "Direct slicer handoff is only allowed from a local AnyStl session" }, { status: 403 });
  }
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Expected application/json request body" }, { status: 415 });
  }

  let body: { url?: unknown; platform?: unknown; title?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url : "";
  const platform = body.platform as Platform;
  const title = typeof body.title === "string" && body.title.trim() ? body.title : "model";
  if (!/^https:\/\//.test(url) || !SLICER_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Missing or unsupported 'url' / 'platform'" }, { status: 400 });
  }

  try {
    const { prepareForSlicer } = await import("@/lib/slicer");
    const file = await prepareForSlicer(url, platform, title);
    const fileUrl = new URL(file.url, request.nextUrl.origin).href;
    const link = `orcaslicer://open?file=${encodeURIComponent(fileUrl)}`;
    const dispatch = await openInDesktopSlicer(link);
    return NextResponse.json({
      opened: dispatch.opened,
      count: file.count,
      fileUrl,
      link,
      ...(dispatch.error ? { error: dispatch.error } : {}),
    });
  } catch (error) {
    console.error("Slicer open:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

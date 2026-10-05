import { NextRequest, NextResponse } from "next/server";
import { PLATFORMS } from "@/lib/platforms";
import { Platform } from "@/lib/types";

export const dynamic = "force-dynamic";

// Only public sites: this must not become a way to read the local network.
const PRIVATE_HOST = /^(localhost|.*\.local|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[)/i;

/** License, author, file types and images for one model, for the quick preview. */
export async function GET(request: NextRequest) {
  const { getDetails } = await import("@/lib/details");
  const url = request.nextUrl.searchParams.get("url") || "";
  const platform = request.nextUrl.searchParams.get("platform") || "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {}
  if (!/^https?:\/\//.test(url) || !host || PRIVATE_HOST.test(host) || !(platform in PLATFORMS)) {
    return NextResponse.json({ error: "Missing or invalid 'url' / 'platform'" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getDetails(url, platform as Platform));
  } catch (error) {
    return NextResponse.json({ url, images: [], formats: [], error: String(error) });
  }
}

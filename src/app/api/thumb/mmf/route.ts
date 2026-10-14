import { NextRequest, NextResponse } from "next/server";
import { mmfThumbnail } from "@/lib/mmfThumbs";
import { proxied } from "@/lib/scrapers/common";

export const dynamic = "force-dynamic";

// Redirects to a MyMiniFactory model's image, looked up on first request.
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") || "";
  if (!/^[a-z0-9-]{1,300}$/.test(slug)) {
    return new NextResponse("Invalid slug", { status: 400 });
  }
  try {
    const url = await mmfThumbnail(slug);
    if (!url || !url.startsWith("https://")) {
      return new NextResponse("No image", { status: 404 });
    }
    // Through the image proxy: the host sends untyped images browsers block.
    return NextResponse.redirect(new URL(proxied(url), request.url), {
      status: 302,
      headers: { "Cache-Control": "public, max-age=604800" },
    });
  } catch {
    return new NextResponse("Lookup failed", { status: 502 });
  }
}

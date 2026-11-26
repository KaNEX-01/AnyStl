import { NextRequest, NextResponse } from "next/server";
import { PLATFORMS } from "@/lib/platforms";
import { isLoopbackHost, isLoopbackOrigin } from "@/lib/slicerOpen";
import { Platform } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Clears the temporary bot-block cooldown for one site or all sites. */
export async function POST(request: NextRequest) {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  if (!isLoopbackHost(host) || (origin !== null && !isLoopbackOrigin(origin))) {
    return NextResponse.json({ error: "Cooldown reset is only allowed from a local AnyStl session" }, { status: 403 });
  }

  let platform: Platform | undefined;
  const raw = await request.text().catch(() => "");
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as { platform?: unknown };
      if (parsed.platform !== undefined) {
        if (typeof parsed.platform !== "string" || !(parsed.platform in PLATFORMS)) {
          return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
        }
        platform = parsed.platform as Platform;
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  const { getSiteHealth, resetSiteBreaker } = await import("@/lib/scrapers");
  resetSiteBreaker(platform);
  return NextResponse.json({ sites: getSiteHealth() });
}

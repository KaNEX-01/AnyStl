import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** How each site has answered recently (searches, Featured, health checks). */
export async function GET() {
  const { getSiteHealth } = await import("@/lib/scrapers");
  return NextResponse.json({ sites: getSiteHealth() });
}

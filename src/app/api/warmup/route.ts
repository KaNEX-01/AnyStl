import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Fire-and-forget: the search page calls this on load so bot checks are
// passed before the first search. Responds right away.
export async function POST() {
  const { warmUpSources } = await import("@/lib/scrapers");
  void warmUpSources();
  return NextResponse.json({ ok: true });
}

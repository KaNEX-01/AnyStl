import { NextRequest, NextResponse } from "next/server";
import { renameCollection } from "@/lib/savedStore";

export const dynamic = "force-dynamic";

/** Renames a collection ({from, to}) or deletes it ({from, to: null}); the models stay saved. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const from = typeof body?.from === "string" ? body.from : "";
  const to = typeof body?.to === "string" ? body.to.trim().slice(0, 40) : null;
  if (!from || (body?.to !== null && !to)) {
    return NextResponse.json({ error: "Expected {from, to} or {from, to: null}" }, { status: 400 });
  }
  return NextResponse.json({ saved: await renameCollection(from, to) });
}

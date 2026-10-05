import { NextRequest, NextResponse } from "next/server";
import { BulkAction, bulkSaved } from "@/lib/savedStore";

export const dynamic = "force-dynamic";

/** {urls, action: "remove"} or {urls, action: "addCollection" | "removeCollection", collection}. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const urls = Array.isArray(body?.urls) ? body.urls.filter((u: unknown): u is string => typeof u === "string") : [];
  const collection = typeof body?.collection === "string" ? body.collection.trim().slice(0, 40) : "";
  let change: BulkAction | null = null;
  if (body?.action === "remove") change = { action: "remove" };
  else if ((body?.action === "addCollection" || body?.action === "removeCollection") && collection) {
    change = { action: body.action, collection };
  }
  if (!urls.length || !change) {
    return NextResponse.json({ error: "Expected {urls, action[, collection]}" }, { status: 400 });
  }
  return NextResponse.json({ saved: await bulkSaved(urls, change) });
}

import { NextRequest, NextResponse } from "next/server";
import { addSaved, listSaved, removeSaved, updateSaved } from "@/lib/savedStore";
import { toModel, toPatch } from "@/lib/savedValidation";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ saved: await listSaved() });
}

export async function POST(request: NextRequest) {
  const model = toModel(await request.json().catch(() => null));
  if (!model) {
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  }
  return NextResponse.json({ saved: await addSaved(model) });
}

/** Edits a saved model's note, collections, license or file types. */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (typeof body?.url !== "string") {
    return NextResponse.json({ error: "Missing 'url'" }, { status: 400 });
  }
  return NextResponse.json({ saved: await updateSaved(body.url, toPatch(body)) });
}

export async function DELETE(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing query parameter 'url'" }, { status: 400 });
  }
  return NextResponse.json({ saved: await removeSaved(url) });
}

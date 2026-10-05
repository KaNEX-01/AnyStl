import { NextRequest, NextResponse } from "next/server";
import { importSaved } from "@/lib/savedStore";
import { toSavedModel } from "@/lib/savedValidation";
import { SavedModel } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Merges an AnyStl export (a JSON array of saved models) into the saved list. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const list: unknown = Array.isArray(body) ? body : body?.saved;
  if (!Array.isArray(list)) {
    return NextResponse.json({ error: "That file isn't an AnyStl export." }, { status: 400 });
  }
  const models = list.map(toSavedModel).filter((m): m is SavedModel => m !== null);
  const { saved, added } = await importSaved(models);
  return NextResponse.json({ saved, added, skipped: list.length - models.length });
}

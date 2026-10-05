import { NextResponse } from "next/server";
import { checkSavedLinks } from "@/lib/savedStore";

export const dynamic = "force-dynamic";

/** Visits every saved model's page and marks the ones that are gone. */
export async function POST() {
  return NextResponse.json({ saved: await checkSavedLinks() });
}

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** A zip of a model's files, prepared by /api/slicer for OrcaSlicer to download. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string; name: string }> }) {
  const { readPrepared } = await import("@/lib/slicer");
  const { token, name } = await params;
  const data = await readPrepared(token, decodeURIComponent(name));
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(decodeURIComponent(name))}`,
    },
  });
}

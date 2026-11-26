import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function contentTypeFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".stl")) return "model/stl";
  if (lower.endsWith(".3mf")) return "application/vnd.ms-3mfdocument";
  if (lower.endsWith(".obj")) return "model/obj";
  if (lower.endsWith(".step") || lower.endsWith(".stp")) return "model/step";
  if (lower.endsWith(".amf")) return "application/x-amf";
  return "application/zip";
}

/** A zip or model file prepared by /api/slicer for OrcaSlicer to download. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string; name: string }> }) {
  const { readPrepared } = await import("@/lib/slicer");
  const { token, name } = await params;
  const decoded = decodeURIComponent(name);
  const data = await readPrepared(token, decoded);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentTypeFor(decoded),
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(decoded)}`,
    },
  });
}

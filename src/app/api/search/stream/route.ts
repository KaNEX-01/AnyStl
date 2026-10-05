import { NextRequest, NextResponse } from "next/server";
import { PLATFORMS } from "@/lib/platforms";
import { Platform, SearchStreamEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The same search as /api/search, streamed as newline-delimited JSON: one
 * "source" line per site as soon as it answers, then a final "done" line.
 */
export async function GET(request: NextRequest) {
  const { searchStream } = await import("@/lib/scrapers");
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ error: "Missing query parameter 'q'" }, { status: 400 });
  }

  const page = Math.min(Math.max(Number(request.nextUrl.searchParams.get("page")) || 1, 1), 50);
  const sources = request.nextUrl.searchParams
    .get("sources")
    ?.split(",")
    .filter((p): p is Platform => p in PLATFORMS);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: SearchStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false; // the client went away
        }
      };
      try {
        await searchStream(query, page, sources, (outcome) => send({ type: "source", ...outcome }));
        send({ type: "done", page });
      } catch (error) {
        console.error("Search failed:", error);
        send({ type: "error", error: `Search failed: ${error}` });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

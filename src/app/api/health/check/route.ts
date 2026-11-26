import { NextRequest, NextResponse } from "next/server";
import { PLATFORMS } from "@/lib/platforms";
import { HealthCheckEvent, Platform } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Runs a test search on every site (or one `?platform=...`), streamed as NDJSON. */
export async function POST(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("platform");
  let platforms: Platform[] | undefined;
  if (requested) {
    if (!(requested in PLATFORMS)) {
      return NextResponse.json({ error: `Unknown platform: ${requested}` }, { status: 400 });
    }
    platforms = [requested as Platform];
  }

  const { checkSites } = await import("@/lib/scrapers");
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: HealthCheckEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false; // the client went away
        }
      };
      await checkSites(send, platforms);
      send({ type: "done" });
      if (open) controller.close();
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

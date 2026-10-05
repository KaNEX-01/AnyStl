import { HealthCheckEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Runs a test search on every site, streamed as newline-delimited JSON, one line per site. */
export async function POST() {
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
      await checkSites(send);
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

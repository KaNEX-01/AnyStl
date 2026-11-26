import { Platform, SearchStreamEvent } from "./types";

/**
 * Runs a search through /api/search/stream, calling `onEvent` as each line
 * arrives, or replaying the same events from a buffered reply for WebViews.
 */
export async function streamSearch(
  query: string,
  page: number,
  sources: Platform[] | undefined,
  onEvent: (event: SearchStreamEvent) => void,
  signal: AbortSignal,
  buffered = false,
): Promise<void> {
  const params = new URLSearchParams({ q: query, page: String(page) });
  if (sources) params.set("sources", sources.join(","));
  if (buffered) params.set("buffered", "1");
  const res = await fetch(`/api/search/stream?${params}`, { signal });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Search failed");
  }

  const dispatch = (event: SearchStreamEvent) => {
    onEvent(event);
    return event.type === "done" || event.type === "error";
  };
  const incomplete = () => new Error("The search connection closed early. Try again.");
  if (buffered) {
    const events: SearchStreamEvent[] = await res.json();
    if (!events.some(dispatch)) throw incomplete();
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += value;
      const lines = buffer.split("\n");
      buffer = done ? "" : lines.pop()!;
      for (const line of lines) {
        if (line.trim() && dispatch(JSON.parse(line) as SearchStreamEvent)) return;
      }
      if (done) throw incomplete();
    }
  } finally {
    // Do not wait for EOF after a terminal event or leave an unread body on error.
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

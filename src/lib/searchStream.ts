import { Platform, SearchStreamEvent } from "./types";

/**
 * Runs a search through /api/search/stream, calling `onEvent` for every
 * line as it arrives. Resolves when the server closes the stream.
 */
export async function streamSearch(
  query: string,
  page: number,
  sources: Platform[] | undefined,
  onEvent: (event: SearchStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const params = new URLSearchParams({ q: query, page: String(page) });
  if (sources) params.set("sources", sources.join(","));
  const res = await fetch(`/api/search/stream?${params}`, { signal });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Search failed");
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    const lines = buffer.split("\n");
    buffer = done ? "" : lines.pop()!;
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as SearchStreamEvent);
    }
    if (done) return;
  }
}

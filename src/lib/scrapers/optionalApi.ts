import type { ModelResult } from "../types";
import { PROXIED_IMAGE_HOSTS, proxied } from "./common";

type ApiRequest = Pick<RequestInit, "method" | "body"> & { headers?: Record<string, string> };

class ApiHttpError extends Error {
  constructor(readonly status: number) {
    super(`API returned HTTP ${status}`);
  }
}

/** API requests must not send credentials to curl or follow redirects. */
export async function fetchApiJson(url: URL | string, init: ApiRequest = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...init.headers },
      signal: AbortSignal.timeout(4_000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new Error("API request could not be completed");
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new ApiHttpError(response.status);
  }
  return response.json().catch(() => { throw new Error("API returned invalid JSON"); });
}

export async function optionalApiSearch(
  provider: string,
  url: URL | string,
  resultKey: string,
  toResult: (item: unknown) => ModelResult | null,
  headers: Record<string, string> = {},
): Promise<ModelResult[] | null> {
  try {
    const payload = apiObject(await fetchApiJson(url, { headers }))?.[resultKey];
    if (!Array.isArray(payload)) throw new Error("Missing results array");
    const results = payload.map(toResult).filter((result): result is ModelResult => result !== null);
    if (payload.length && !results.length) throw new Error("Invalid results");
    return results;
  } catch (error) {
    // URLs, error messages and response bodies can contain credentials.
    const reason = error instanceof ApiHttpError ? `returned HTTP ${error.status}` : "unavailable or returned an invalid response";
    console.warn(`${provider} API ${reason}; falling back to the regular search`);
    return null;
  }
}

export function apiObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Never expose arbitrary links or widen the existing image proxy's allowlist. */
export function providerUrl(raw: unknown, hosts: readonly string[]): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && !url.port && !url.username && !url.password && hosts.includes(url.hostname)) return url;
  } catch {
    // A malformed link should not break the other cards.
  }
  return null;
}

export function providerImage(raw: unknown, hosts: readonly string[]): string {
  const url = providerUrl(raw, hosts);
  if (!url) return "";
  return PROXIED_IMAGE_HOSTS.has(url.hostname) ? proxied(url.href) : url.href;
}

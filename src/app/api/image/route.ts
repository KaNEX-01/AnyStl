import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { httpRequest, PROXIED_IMAGE_HOSTS as ALLOWED_HOSTS } from "@/lib/scrapers/common";

export const dynamic = "force-dynamic";



/** Identifies an image from its first bytes, for hosts that mislabel them. */
function sniffImageType(data: Uint8Array): string | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => data[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...data.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

// Thumbnails are cached on disk so repeat searches don't re-download them —
// bursts of image requests are what gets an IP rate-limited.
const CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
  "anystl",
  "images",
);

// At most this many upstream fetches per host at once.
const MAX_PER_HOST = 4;
const active = new Map<string, number>();
const waiting = new Map<string, Array<() => void>>();

async function withHostSlot<T>(host: string, fn: () => Promise<T>): Promise<T> {
  if ((active.get(host) || 0) >= MAX_PER_HOST) {
    await new Promise<void>((resolve) => waiting.set(host, [...(waiting.get(host) || []), resolve]));
  }
  active.set(host, (active.get(host) || 0) + 1);
  try {
    return await fn();
  } finally {
    active.set(host, (active.get(host) || 1) - 1);
    waiting.get(host)?.shift()?.();
  }
}

function imageResponse(body: BodyInit, type: string) {
  return new NextResponse(body, {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" },
  });
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  let target: URL;
  try {
    target = new URL(raw || "");
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return new NextResponse("Host not allowed", { status: 403 });
  }

  const key = createHash("sha1").update(target.href).digest("hex");
  const file = path.join(CACHE_DIR, key);
  try {
    const [data, type] = await Promise.all([fs.readFile(file), fs.readFile(`${file}.type`, "utf8")]);
    return imageResponse(new Uint8Array(data), type);
  } catch {
    // Not cached yet.
  }

  try {
    const result = await withHostSlot(target.hostname, async () => {
      const upstream = await httpRequest(target.href, { headers: { Accept: "image/*" } });
      if (upstream.status !== 200) return null;
      const data = new Uint8Array(upstream.body);
      const type = upstream.contentType.startsWith("image/") ? upstream.contentType : sniffImageType(data);
      return type ? { data, type } : null;
    });
    if (!result) {
      return new NextResponse("Upstream error", { status: 502 });
    }

    await fs.mkdir(CACHE_DIR, { recursive: true });
    await Promise.all([fs.writeFile(file, result.data), fs.writeFile(`${file}.type`, result.type)]).catch(() => {});
    return imageResponse(result.data, result.type);
  } catch {
    return new NextResponse("Upstream error", { status: 502 });
  }
}

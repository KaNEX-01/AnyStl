import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { getSharedContext } from "./browser";
import { fetchJson, httpRequest } from "./scrapers/common";
import { Platform } from "./types";

// "Open in OrcaSlicer": the model's print files are handed to OrcaSlicer
// through its orcaslicer://open?file=<url> link, and OrcaSlicer downloads
// them itself. Only sites that let anyone download without an account work.
// A single file is passed as the site's own link; several are zipped here
// and served from AnyStl, since the link takes one file (OrcaSlicer unzips).

interface RemoteFile {
  name: string;
  url: string;
}

const CACHE_DIR = path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
  "anystl",
  "slicer",
);
/** Prepared zips are only needed until OrcaSlicer has fetched them. */
const KEEP_MS = 60 * 60 * 1000;
const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;

/** File types OrcaSlicer opens as models. */
const MODEL_EXT = /\.(3mf|stl|obj|step|stp|amf)$/i;

/**
 * The files worth opening: 3MF projects when there are any (their STLs are
 * usually the same parts), otherwise the plain meshes, otherwise STEP.
 */
export function pickFiles(files: RemoteFile[]): RemoteFile[] {
  const models = files.filter((f) => MODEL_EXT.test(f.name));
  for (const ext of [/\.3mf$/i, /\.(stl|obj|amf)$/i, /\.(step|stp)$/i]) {
    const match = models.filter((f) => ext.test(f.name));
    if (match.length) return match.slice(0, MAX_FILES);
  }
  return [];
}

const PRINTABLES_API = "https://api.printables.com/graphql/";

async function printablesFiles(url: string): Promise<RemoteFile[]> {
  const id = url.match(/\/model\/(\d+)/)?.[1];
  if (!id) throw new Error("Not a Printables model link");
  const gql = <T>(query: string, variables: Record<string, string>) =>
    fetchJson<{ data?: T; errors?: unknown[] }>(
      PRINTABLES_API,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://www.printables.com" },
        body: JSON.stringify({ query, variables }),
      },
      "Printables",
    );

  const listed = await gql<{ print: { stls: { id: string; name: string }[] } | null }>(
    "query ($id: ID!) { print(id: $id) { stls { id name } } }",
    { id },
  );
  const print = listed.data?.print;
  if (!print) throw new Error("Printables doesn't have this model any more");

  // Download links are handed out per file.
  const wanted = pickFiles(print.stls.map((f) => ({ name: f.name, url: f.id })));
  return Promise.all(
    wanted.map(async (f) => {
      const res = await gql<{ getDownloadLink: { ok: boolean; output: { link: string } | null } }>(
        `mutation ($id: ID!, $printId: ID!) {
          getDownloadLink(id: $id, printId: $printId, fileType: stl, source: model_detail) { ok output { link } }
        }`,
        { id: f.url, printId: id },
      );
      const link = res.data?.getDownloadLink.output?.link;
      if (!link) throw new Error("Printables wouldn't hand out the download link");
      return { name: f.name, url: link };
    }),
  );
}

/**
 * Thingiverse's API needs an account, but its "Download all files" button
 * (after an ad countdown) fetches every file from the public CDN. The page
 * is driven in the background and those fetches are noted, not downloaded.
 */
async function thingiverseFiles(url: string): Promise<RemoteFile[]> {
  const id = url.match(/thing:(\d+)/)?.[1];
  if (!id) throw new Error("Not a Thingiverse thing link");
  const context = await getSharedContext();
  const page = await context.newPage();
  const found = new Map<string, string>();
  let lastFound = 0;
  try {
    await page.route(/cdn\.thingiverse\.com\/assets\//, (route) => {
      const req = route.request();
      if (req.resourceType() !== "xhr" && req.resourceType() !== "fetch") return route.continue();
      const fileUrl = req.url();
      found.set(fileUrl, decodeURIComponent(new URL(fileUrl).pathname.split("/").pop() || "model"));
      lastFound = Date.now();
      return route.fulfill({ status: 200, contentType: "application/octet-stream", body: "" });
    });
    await page.goto(`https://www.thingiverse.com/thing:${id}/files`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const button = page.getByText(/Download all files/i).first();
    await button.waitFor({ timeout: 20_000 }).catch(() => {
      throw new Error("Thingiverse's files page didn't load");
    });
    await button.click();
    // The countdown is ~8 s; the files follow one after another.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && (!lastFound || Date.now() - lastFound < 2_000)) {
      await page.waitForTimeout(250);
    }
  } finally {
    await page.close().catch(() => {});
  }
  if (!found.size) throw new Error("Thingiverse didn't start the download");
  return [...found].map(([fileUrl, name]) => ({ name, url: fileUrl }));
}

const SOURCES: Partial<Record<Platform, (url: string) => Promise<RemoteFile[]>>> = {
  printables: printablesFiles,
  thingiverse: thingiverseFiles,
};

// Minimal ZIP writer (deflate, no zip64), enough for a handful of models.
function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const used = new Set<string>();
  for (const entry of entries) {
    // Two files of the same name (different folders on the site) both stay.
    let name = entry.name.replace(/[\\/:*?"<>|]/g, "_");
    for (let n = 2; used.has(name.toLowerCase()); n++) name = entry.name.replace(/(\.[^.]+)?$/, ` (${n})$1`);
    used.add(name.toLowerCase());

    const fileName = Buffer.from(name, "utf8");
    const packed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    parts.push(local, fileName, packed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(entry.data.length, 24);
    dir.writeUInt16LE(fileName.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, fileName);
    offset += local.length + fileName.length + packed.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

async function download(file: RemoteFile): Promise<Buffer> {
  const res = await httpRequest(file.url, { timeoutMs: 120_000 });
  if (res.status !== 200) throw new Error(`${file.name} couldn't be downloaded (${res.status})`);
  return res.body;
}

/** "Orbit Revolver — Working!" → "Orbit-Revolver-Working". */
function slug(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 60) || "model"
  );
}

async function removeOld(): Promise<void> {
  const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries.map(async (e) => {
      const dir = path.join(CACHE_DIR, e.name);
      const stat = await fs.stat(dir).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > KEEP_MS) await fs.rm(dir, { recursive: true, force: true });
    }),
  );
}

export interface SlicerFile {
  /** Absolute link to the file (the site's, or "/api/slicer/file/…" on AnyStl). */
  url: string;
  /** How many model files it holds. */
  count: number;
}

/** Finds a model's print files and returns one link OrcaSlicer can open. */
export async function prepareForSlicer(url: string, platform: Platform, title: string): Promise<SlicerFile> {
  const source = SOURCES[platform];
  if (!source) throw new Error("This site needs an account to download, so open it on the site");
  const files = pickFiles(await source(url));
  if (!files.length) throw new Error("No STL, 3MF, OBJ or STEP files on this model");
  if (files.length === 1) return { url: files[0]!.url, count: 1 };

  const data: { name: string; data: Buffer }[] = [];
  let total = 0;
  // A few at a time: polite to the site, and the size cap can stop early.
  for (let i = 0; i < files.length; i += 4) {
    const batch = await Promise.all(files.slice(i, i + 4).map(async (f) => ({ name: f.name, data: await download(f) })));
    total += batch.reduce((n, f) => n + f.data.length, 0);
    if (total > MAX_TOTAL_BYTES) throw new Error("This model's files are too big to send in one go");
    data.push(...batch);
  }

  await removeOld();
  const token = randomBytes(12).toString("hex");
  const name = `${slug(title)}.zip`;
  await fs.mkdir(path.join(CACHE_DIR, token), { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, token, name), zip(data));
  return { url: `/api/slicer/file/${token}/${encodeURIComponent(name)}`, count: files.length };
}

/** A prepared zip, or null when it's gone or the path isn't one of ours. */
export async function readPrepared(token: string, name: string): Promise<Buffer | null> {
  if (!/^[a-f0-9]{24}$/.test(token) || name.includes("/") || name.includes("\\") || name.startsWith(".")) return null;
  return fs.readFile(path.join(CACHE_DIR, token, name)).catch(() => null);
}

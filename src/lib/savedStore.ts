import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ModelResult, Platform, SavedModel } from "./types";
import { fetchJson, fetchText } from "./scrapers/common";

// Saved models live in a JSON file in the user's data directory, so they
// survive browser changes, cleared site data and reinstalls of AnyStl.
function dataDir(): string {
  if (process.env.ANYSTL_DATA_DIR) return process.env.ANYSTL_DATA_DIR;
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "AnyStl");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "AnyStl");
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "anystl");
}

const SAVED_FILE = path.join(dataDir(), "saved.json");

// Serialize writes so two quick clicks can't interleave read-modify-write.
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

async function read(): Promise<SavedModel[]> {
  try {
    const data = JSON.parse(await fs.readFile(SAVED_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function write(models: SavedModel[]): Promise<void> {
  await fs.mkdir(path.dirname(SAVED_FILE), { recursive: true });
  // Write to a temp file then rename, so a crash can't leave a half-written file.
  const tmp = `${SAVED_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(models, null, 2));
  await fs.rename(tmp, SAVED_FILE);
}

/** Read-modify-write under the lock; writes only when `fn` changed something. */
function modify(fn: (models: SavedModel[]) => SavedModel[]): Promise<SavedModel[]> {
  return serialized(async () => {
    const models = await read();
    const updated = fn(models);
    if (updated !== models) await write(updated);
    return updated;
  });
}

export function listSaved(): Promise<SavedModel[]> {
  return serialized(read);
}

export function addSaved(model: ModelResult): Promise<SavedModel[]> {
  return modify((models) =>
    models.some((m) => m.url === model.url) ? models : [{ ...model, savedAt: Date.now() }, ...models],
  );
}

export function removeSaved(url: string): Promise<SavedModel[]> {
  return modify((models) => {
    const updated = models.filter((m) => m.url !== url);
    return updated.length !== models.length ? updated : models;
  });
}

export type SavedPatch = Partial<Pick<SavedModel, "note" | "collections" | "license" | "formats">>;

export function updateSaved(url: string, patch: SavedPatch): Promise<SavedModel[]> {
  return modify((models) => {
    if (!models.some((m) => m.url === url)) return models;
    return models.map((m) => (m.url === url ? { ...m, ...patch } : m));
  });
}

/** Renames a collection on every model, or removes it when `to` is null. */
export function renameCollection(from: string, to: string | null): Promise<SavedModel[]> {
  return modify((models) => {
    if (!models.some((m) => m.collections?.includes(from))) return models;
    return models.map((m) => {
      if (!m.collections?.includes(from)) return m;
      const next = m.collections.flatMap((c) => (c === from ? (to ? [to] : []) : [c]));
      return { ...m, collections: [...new Set(next)] };
    });
  });
}

export type BulkAction =
  | { action: "remove" }
  | { action: "addCollection"; collection: string }
  | { action: "removeCollection"; collection: string };

/** One change applied to several saved models at once. */
export function bulkSaved(urls: string[], change: BulkAction): Promise<SavedModel[]> {
  const targets = new Set(urls);
  return modify((models) => {
    if (!models.some((m) => targets.has(m.url))) return models;
    if (change.action === "remove") return models.filter((m) => !targets.has(m.url));
    return models.map((m) => {
      if (!targets.has(m.url)) return m;
      const current = m.collections || [];
      const collections =
        change.action === "addCollection"
          ? [...new Set([...current, change.collection])]
          : current.filter((c) => c !== change.collection);
      return { ...m, collections };
    });
  });
}

/**
 * Adds imported models. Ones already saved keep their entry but gain the
 * imported collections, and the imported note if they had none.
 */
export function importSaved(incoming: SavedModel[]): Promise<{ saved: SavedModel[]; added: number }> {
  let added = 0;
  return modify((models) => {
    const byUrl = new Map(models.map((m) => [m.url, m]));
    const fresh: SavedModel[] = [];
    for (const m of incoming) {
      const existing = byUrl.get(m.url);
      if (existing) {
        byUrl.set(m.url, {
          ...existing,
          note: existing.note || m.note,
          collections: [...new Set([...(existing.collections || []), ...(m.collections || [])])],
        });
      } else if (!fresh.some((f) => f.url === m.url)) {
        fresh.push(m);
      }
    }
    added = fresh.length;
    return [...fresh, ...models.map((m) => byUrl.get(m.url)!)];
  }).then((saved) => ({ saved, added }));
}

/**
 * Whether a model page still exists. Only a clear "gone" answer (404/410)
 * counts as dead; bot checks and timeouts are "unknown", not dead.
 */
type LinkStatus = "ok" | "dead" | "unknown";

/** Printables' pages sit behind a bot check, but its API says whether a model exists. */
async function checkPrintables(url: string): Promise<LinkStatus> {
  const id = url.match(/\/model\/(\d+)/)?.[1];
  if (!id) return "unknown";
  const data = await fetchJson<{ data?: { print: { id: string } | null } }>(
    "https://api.printables.com/graphql/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://www.printables.com" },
      body: JSON.stringify({ query: "query($id: ID!) { print(id: $id) { id } }", variables: { id } }),
    },
    "Printables API",
  );
  if (!data.data) return "unknown";
  return data.data.print ? "ok" : "dead";
}

/** Thingiverse answers 200 for removed things too, but only real ones carry their og:url. */
async function checkThingiverse(url: string): Promise<LinkStatus> {
  const id = url.match(/thing:(\d+)/)?.[1];
  if (!id) return "unknown";
  const { status, text: html } = await fetchText(url, { timeoutMs: 15_000 });
  if (status === 404 || status === 410) return "dead";
  if (status !== 200) return "unknown";
  return html.includes(`thing:${id}"`) ? "ok" : "dead";
}

async function checkLink(url: string, platform: Platform): Promise<LinkStatus> {
  try {
    if (platform === "printables") return await checkPrintables(url);
    if (platform === "thingiverse") return await checkThingiverse(url);
  } catch {
    return "unknown";
  }
  const verdict = (status: number) =>
    status === 404 || status === 410 ? "dead" : status >= 200 && status < 400 ? "ok" : "unknown";
  try {
    const { status } = await fetchText(url, {
      timeoutMs: 15_000,
      retryIf: (r) => r.status === 403 || r.status === 429,
    });
    return verdict(status);
  } catch {
    return "unknown";
  }
}

/** Checks every saved link (a few at a time) and stores the outcome. */
export async function checkSavedLinks(): Promise<SavedModel[]> {
  const models = await listSaved();
  const results = new Map<string, LinkStatus>();
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < models.length) {
        const m = models[next++]!;
        results.set(m.url, await checkLink(m.url, m.platform));
      }
    }),
  );
  const now = Date.now();
  return modify((current) =>
    current.map((m) => (results.has(m.url) ? { ...m, linkStatus: results.get(m.url), checkedAt: now } : m)),
  );
}

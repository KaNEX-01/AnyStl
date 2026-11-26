import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AppSettings, DEFAULT_SETTINGS, sanitizeSettings } from "./settings";

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

const SETTINGS_FILE = path.join(dataDir(), "settings.json");

let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

async function read(): Promise<AppSettings> {
  try {
    const raw = JSON.parse(await fs.readFile(SETTINGS_FILE, "utf8"));
    return sanitizeSettings(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_SETTINGS };
    throw err;
  }
}

async function write(settings: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  const tmp = `${SETTINGS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2));
  await fs.rename(tmp, SETTINGS_FILE);
}

export function getSettings(): Promise<AppSettings> {
  return serialized(read);
}

export function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return serialized(async () => {
    const current = await read();
    const next = sanitizeSettings({ ...current, ...patch });
    await write(next);
    return next;
  });
}

export function settingsDataDir(): string {
  return dataDir();
}

import os from "node:os";
import path from "node:path";

/** Per-user persistent data directory for saved.json and settings.json. */
export function appDataDir(): string {
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

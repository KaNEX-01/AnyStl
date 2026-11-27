// Prepares desktop/resources/{app,node} for a zero-build, self-contained
// Tauri desktop release (Windows installer/portable & Linux AppImage/deb).
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");

if (!existsSync(path.join(standaloneDir, "server.js"))) {
  console.error("Missing .next/standalone/server.js. Run `npm run build` first.");
  process.exit(1);
}

const resourcesRoot = path.join(root, "desktop", "resources");
const appDest = path.join(resourcesRoot, "app");
const nodeDest = path.join(resourcesRoot, "node");

rmSync(appDest, { recursive: true, force: true });
rmSync(nodeDest, { recursive: true, force: true });
mkdirSync(appDest, { recursive: true });
mkdirSync(nodeDest, { recursive: true });

console.log("-> Copying Next.js standalone server into desktop/resources/app...");
cpSync(standaloneDir, appDest, { recursive: true });

if (existsSync(staticDir)) {
  const targetStatic = path.join(appDest, ".next", "static");
  mkdirSync(path.dirname(targetStatic), { recursive: true });
  cpSync(staticDir, targetStatic, { recursive: true });
}

if (existsSync(publicDir)) {
  cpSync(publicDir, path.join(appDest, "public"), { recursive: true });
}

// Include full Playwright + playwright-core packages and browser installer
// scripts so first launch can download Chromium automatically on machines
// without Chrome/Edge/Chromium.
for (const pkg of ["playwright", "playwright-core"]) {
  const src = path.join(root, "node_modules", pkg);
  if (existsSync(src)) {
    const dest = path.join(appDest, "node_modules", pkg);
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
  }
}
const scriptsDest = path.join(appDest, "scripts");
mkdirSync(scriptsDest, { recursive: true });
for (const scriptName of ["install-browsers.sh", "install-browsers.ps1"]) {
  const src = path.join(root, "scripts", scriptName);
  if (existsSync(src)) {
    const dest = path.join(scriptsDest, scriptName);
    cpSync(src, dest);
    if (process.platform !== "win32" && scriptName.endsWith(".sh")) {
      chmodSync(dest, 0o755);
    }
  }
}

const nodeBinName = process.platform === "win32" ? "node.exe" : "node";
const bundledNode = path.join(nodeDest, nodeBinName);
console.log(`-> Bundling Node.js runtime (${process.version}) into desktop/resources/node/${nodeBinName}...`);
cpSync(process.execPath, bundledNode);
if (process.platform !== "win32") {
  chmodSync(bundledNode, 0o755);
}

const sizeMb = (statSync(bundledNode).size / (1024 * 1024)).toFixed(1);
console.log(`Desktop bundle ready (Node runtime: ${sizeMb} MB).`);

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
// Use Next.js's environment loader so .env.local is parsed as data, not sourced by Bash.
const { loadEnvConfig } = require("@next/env");
let envError = false;
loadEnvConfig(process.cwd(), false, { info() {}, error() { envError = true; } });
if (envError) {
  console.error("Could not load the local AnyStl environment.");
  process.exit(1);
}

let passed = 0;
let failed = 0;
let skipped = 0;

for (const file of process.argv.slice(2)) {
  const site = path.basename(file, ".live.mjs");
  try {
    const { default: { tokenEnv, requiredEnv = tokenEnv ? [tokenEnv] : [], query, search } } = await import(pathToFileURL(path.resolve(file)).href);
    const missing = requiredEnv.filter((key) => !process.env[key]?.trim());
    if (missing.length) {
      console.log(`SKIP ${site}: set ${missing.join(" and ")} in .env.local or the environment.`);
      skipped++;
      continue;
    }

    const results = await search(query);
    if (!Array.isArray(results) || results.length === 0 || !results.every((result) =>
      result?.platform === site && typeof result.title === "string" && result.title.trim() &&
      typeof result.url === "string" && result.url.startsWith("https://"))) {
      console.error(`FAIL ${site}: the API returned no usable models for the test query.`);
      failed++;
      continue;
    }
    console.log(`PASS ${site}: ${results.length} models returned directly by the API.`);
    passed++;
  } catch {
    // Don't print arbitrary exception text from an authenticated request.
    console.error(`FAIL ${site}: could not complete the API check.`);
    failed++;
  }
}

console.log(`Live API checks: ${passed} passed, ${failed} failed, ${skipped} skipped.`);
if (failed || !passed) process.exitCode = 1;

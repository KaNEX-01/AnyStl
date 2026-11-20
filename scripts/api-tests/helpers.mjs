import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export function loadScraper(name = "index") {
  return loadLib(`scrapers/${name}`);
}

export function loadLib(name) {
  return require(path.join(process.env.ANYSTL_TEST_BUILD, `${name}.js`));
}

export function setTestEnv(t, key, value) {
  const previous = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

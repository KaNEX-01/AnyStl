// AnyStl smoke test: starts its own production server (on a spare port, with
// a throwaway data directory so your saved models aren't touched) and runs
// every feature against the live sites. Prints a PASS / FAIL / SKIP table and
// exits non-zero if anything failed.
//
//   npm run build && npm run smoke            everything (~2 min)
//   npm run smoke -- --quick                  skip Featured and OrcaSlicer
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const QUICK = process.argv.includes('--quick');
const PORT = Number(process.env.SMOKE_PORT || 3999);
const BASE = `http://localhost:${PORT}`;
const isWin = process.platform === 'win32';

// Sites that only work in the visible browser, which needs Xvfb on Linux.
const HEADFUL = new Set(['turbosquid', 'free3d']);

const results = [];
function record(area, name, status, info = '') {
  results.push({ area, name, status, info });
  const mark = status === 'PASS' ? '\x1b[32mPASS\x1b[0m' : status === 'SKIP' ? '\x1b[33mSKIP\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`${mark}  ${area.padEnd(9)} ${name.padEnd(30)} ${info}`);
}

/** Runs one check; a thrown error is a FAIL with its message. */
async function check(area, name, fn) {
  try {
    const info = await fn();
    record(area, name, 'PASS', info || '');
  } catch (err) {
    record(area, name, 'FAIL', err instanceof Error ? err.message : String(err));
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function api(pathname, init = {}) {
  const resp = await fetch(BASE + pathname, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : {},
    signal: AbortSignal.timeout(init.timeout || 120_000),
  });
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: resp.status, json, text, headers: resp.headers };
}

/** Newline-delimited JSON events from a streaming endpoint. */
async function ndjson(pathname, init = {}) {
  const { text, status } = await api(pathname, { ...init, timeout: 300_000 });
  assert(status === 200, `HTTP ${status}`);
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------- server

let xvfb = null;
let server = null;
let dataDir = null;

function startXvfb() {
  if (process.platform !== 'linux') return null;
  const hasXvfb = (process.env.PATH || '').split(':').some((dir) => existsSync(`${dir}/Xvfb`));
  if (!hasXvfb) return null;
  let n = 120;
  while (n < 199 && (existsSync(`/tmp/.X${n}-lock`) || existsSync(`/tmp/.X11-unix/X${n}`))) n++;
  xvfb = spawn('Xvfb', [`:${n}`, '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  xvfb.on('error', () => (xvfb = null));
  return `:${n}`;
}

async function startServer() {
  if (!existsSync('.next/BUILD_ID')) {
    console.error('No production build found. Run `npm run build` first.');
    process.exit(2);
  }
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(1000) });
    console.error(`Port ${PORT} is already in use. Stop that server or set SMOKE_PORT.`);
    process.exit(2);
  } catch {}

  dataDir = await mkdtemp(path.join(os.tmpdir(), 'anystl-smoke-'));
  const display = startXvfb();
  const env = { ...process.env, ANYSTL_DATA_DIR: dataDir };
  if (display) env.ANYSTL_XVFB_DISPLAY = display;
  else delete env.ANYSTL_XVFB_DISPLAY;

  const nextBin = isWin ? 'node_modules\\.bin\\next.cmd' : 'node_modules/.bin/next';
  server = spawn(nextBin, ['start', '-p', String(PORT)], { env, stdio: 'ignore', shell: isWin, detached: !isWin });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(BASE, { signal: AbortSignal.timeout(1000) });
      return !!display;
    } catch {
      await sleep(500);
    }
  }
  throw new Error('Server did not start');
}

async function stopServer() {
  if (server?.pid) {
    try {
      // The whole group: next-server plus the scraper Chromiums it started.
      if (isWin) spawn('taskkill', ['/F', '/T', '/PID', String(server.pid)], { stdio: 'ignore', shell: true });
      else process.kill(-server.pid, 'SIGTERM');
    } catch {}
  }
  try {
    xvfb?.kill();
  } catch {}
  if (dataDir) await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}

// ---------------------------------------------------------------- checks

async function pages() {
  for (const p of ['/', '/featured', '/saved', '/opened', '/health']) {
    await check('pages', p, async () => {
      const { status } = await api(p);
      assert(status === 200, `HTTP ${status}`);
    });
  }
}

async function validation() {
  const cases = [
    ['search without q', '/api/search', 400],
    ['details: local address', '/api/details?platform=printables&url=http://127.0.0.1/x', 400],
    ['image: host not allowed', '/api/image?url=https://example.com/a.png', 403],
    ['mmf thumb: bad slug', '/api/thumb/mmf?slug=../x', 400],
    ['slicer: unsupported site', '/api/slicer?platform=makerworld&url=https://x', 400],
    ['slicer file: bad token', '/api/slicer/file/nope/x.zip', 404],
  ];
  for (const [name, url, expected] of cases) {
    await check('guards', name, async () => {
      const { status } = await api(url);
      assert(status === expected, `expected ${expected}, got ${status}`);
    });
  }
}

/** The app's own per-site check: a test search on every site. */
async function siteHealth(hasDisplay) {
  const events = await ndjson('/api/health/check', { method: 'POST' });
  for (const e of events.filter((e) => e.type === 'site')) {
    const c = e.check;
    if (HEADFUL.has(e.platform) && !hasDisplay) {
      record('sites', e.platform, 'SKIP', 'needs Xvfb');
      continue;
    }
    const warn = c.warnings?.length ? ` warnings: ${c.warnings.join(', ')}` : '';
    if (c.status === 'ok' && c.count > 0) record('sites', e.platform, warn ? 'FAIL' : 'PASS', `${c.count} results, ${c.ms} ms${warn}`);
    else record('sites', e.platform, 'FAIL', c.error || `${c.status}, ${c.count} results`);
  }
}

/** A real streamed search; returns the first few results of each site for later checks. */
async function search() {
  const samples = new Map();
  await check('search', 'stream "benchy"', async () => {
    const events = await ndjson('/api/search/stream?q=benchy');
    assert(events.at(-1)?.type === 'done', 'no "done" event');
    const sources = events.filter((e) => e.type === 'source');
    for (const s of sources) if (s.results.length) samples.set(s.platform, s.results.slice(0, 3));
    const bad = sources.flatMap((s) => s.results.filter((r) => !r.title || !r.url || !r.thumbnail).map(() => s.platform));
    assert(bad.length === 0, `results missing title/url/image: ${[...new Set(bad)].join(', ')}`);
    return `${sources.length} sites answered, ${samples.size} with results`;
  });
  await check('search', 'page 2', async () => {
    const { status, json } = await api('/api/search?q=benchy&page=2&sources=printables,thingiverse');
    assert(status === 200 && json.page === 2, `HTTP ${status}`);
    assert(json.results.length > 0, 'no results on page 2');
    return `${json.results.length} results`;
  });
  return samples;
}

/** Thumbnails served by AnyStl itself (image proxy, MyMiniFactory lookups) must be real images. */
async function images(samples) {
  for (const [platform, list] of samples) {
    const local = list.find((r) => r.thumbnail.startsWith('/api/'));
    if (!local) continue;
    await check('images', platform, async () => {
      const resp = await fetch(BASE + local.thumbnail, { signal: AbortSignal.timeout(60_000) });
      const type = resp.headers.get('content-type') || '';
      assert(resp.ok, `HTTP ${resp.status}`);
      assert(type.startsWith('image/'), `served as ${type}, browsers will block it`);
      return type;
    });
  }
}

/** The quick preview for one model of every site. Bot checks can turn away a first visit, so retry once. */
async function details(samples) {
  for (const [platform, list] of samples) {
    await check('preview', platform, async () => {
      let last = '';
      for (const r of list.slice(0, 2)) {
        const q = `/api/details?platform=${platform}&url=${encodeURIComponent(r.url)}`;
        for (let attempt = 0; attempt < 2; attempt++) {
          const { json } = await api(q);
          if (json && !json.error) return `${json.images.length} images, formats: ${json.formats.join(' ') || '-'}`;
          last = json?.error || 'bad response';
        }
      }
      throw new Error(last);
    });
  }
}

async function featured(hasDisplay) {
  const { status, json } = await api('/api/featured?refresh=1', { timeout: 300_000 });
  if (status !== 200) return record('featured', 'all sites', 'FAIL', `HTTP ${status}`);
  for (const s of json.sections) {
    if (HEADFUL.has(s.platform) && !hasDisplay) record('featured', s.platform, 'SKIP', 'needs Xvfb');
    else if (s.results.length > 0) record('featured', s.platform, 'PASS', `${s.results.length} models`);
    else record('featured', s.platform, 'FAIL', s.error || 'no models');
  }
}

/** The whole Saved page flow, in the throwaway data directory. */
async function saved() {
  const A = 'https://www.printables.com/model/3161-3d-benchy';
  const GONE = 'https://www.thingiverse.com/thing:999999999';
  const model = (url, platform) => ({ title: 'Smoke test', url, thumbnail: '', likes: 0, downloads: 0, platform });
  const urls = (json) => json.saved.map((m) => m.url);
  const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body) });

  await check('saved', 'add + no duplicates', async () => {
    await post('/api/saved', model(A, 'printables'));
    await post('/api/saved', model(A, 'printables'));
    const { json } = await post('/api/saved', model(GONE, 'thingiverse'));
    assert(json.saved.length === 2, `expected 2, got ${json.saved.length}`);
  });
  await check('saved', 'rejects invalid model', async () => {
    const { status } = await post('/api/saved', { title: 1 });
    assert(status === 400, `HTTP ${status}`);
  });
  await check('saved', 'note + collection', async () => {
    const { json } = await api('/api/saved', { method: 'PATCH', body: JSON.stringify({ url: A, note: 'hi', collections: ['Boats'] }) });
    const m = json.saved.find((m) => m.url === A);
    assert(m.note === 'hi' && m.collections?.includes('Boats'), JSON.stringify(m));
  });
  await check('saved', 'bulk add to collection', async () => {
    const { json } = await post('/api/saved/bulk', { urls: [A, GONE], action: 'addCollection', collection: 'Test' });
    assert(json.saved.every((m) => m.collections?.includes('Test')), 'not added to all');
  });
  await check('saved', 'rename + delete collection', async () => {
    await post('/api/saved/collections', { from: 'Test', to: 'Renamed' });
    const { json } = await post('/api/saved/collections', { from: 'Boats', to: null });
    const cols = new Set(json.saved.flatMap((m) => m.collections || []));
    assert(cols.has('Renamed') && !cols.has('Test') && !cols.has('Boats'), [...cols].join(', '));
  });
  await check('saved', 'export / import round trip', async () => {
    const { json: exported } = await api('/api/saved');
    const { json } = await post('/api/saved/import', exported);
    assert(json.added === 0 && json.skipped === 0 && json.saved.length === 2, JSON.stringify({ ...json, saved: undefined }));
    const { status } = await post('/api/saved/import', { foo: 1 });
    assert(status === 400, `junk import answered ${status}`);
  });
  await check('saved', 'check links', async () => {
    const { json } = await api('/api/saved/check', { method: 'POST', timeout: 200_000 });
    const status = Object.fromEntries(json.saved.map((m) => [m.url, m.linkStatus]));
    assert(status[A] === 'ok', `live Printables model is "${status[A]}"`);
    assert(status[GONE] === 'dead', `removed Thingiverse model is "${status[GONE]}"`);
  });
  await check('saved', 'bulk remove + delete', async () => {
    await post('/api/saved/bulk', { urls: [GONE], action: 'remove' });
    const { json } = await api(`/api/saved?url=${encodeURIComponent(A)}`, { method: 'DELETE' });
    assert(urls(json).length === 0, `${urls(json).length} left`);
  });
}

function curlGet(url, userAgent) {
  return new Promise((resolve, reject) => {
    const curl = spawn('curl', ['--silent', '--location', '--max-time', '120', '--user-agent', userAgent, '--write-out', '%{stderr}%{http_code}', url]);
    const out = [];
    let status = '';
    curl.stdout.on('data', (c) => out.push(c));
    curl.stderr.on('data', (c) => (status += c));
    curl.on('error', reject);
    curl.on('close', () => resolve({ status: Number(status.trim()), data: Buffer.concat(out) }));
  });
}

async function slicer() {
  const cases = [
    ['printables', 'https://www.printables.com/model/3161-3d-benchy', 'single file'],
    ['printables', 'https://www.printables.com/model/1192178-all-terrain-assault-benchy', 'several files (zip)'],
    ['thingiverse', 'https://www.thingiverse.com/thing:763622', 'single file'],
  ];
  for (const [platform, url, kind] of cases) {
    await check('slicer', `${platform} ${kind}`, async () => {
      const { json } = await api(`/api/slicer?platform=${platform}&title=Smoke&url=${encodeURIComponent(url)}`);
      assert(json?.link?.startsWith('orcaslicer://open?file='), json?.error || 'no link');
      const file = decodeURIComponent(json.link.split('file=')[1]);
      // OrcaSlicer downloads the file itself, with libcurl; do the same (Node's
      // own fetch gets turned away by Cloudflare where OrcaSlicer isn't).
      const { status, data } = await curlGet(file, 'OrcaSlicer/2.3.0');
      assert(status === 200, `file answered ${status}`);
      if (json.count > 1) assert(data.readUInt32LE(0) === 0x04034b50, 'not a zip');
      return `${json.count} file(s), ${(data.length / 1e6).toFixed(1)} MB`;
    });
  }
}

// ---------------------------------------------------------------- main

process.on('SIGINT', async () => {
  await stopServer();
  process.exit(130);
});

const started = Date.now();
let hasDisplay = false;
try {
  console.log(`Starting AnyStl on ${BASE} (throwaway data dir)...`);
  hasDisplay = await startServer();
  if (!hasDisplay) console.log('No Xvfb: TurboSquid and Free3D will be skipped.');
  console.log();

  await pages();
  await validation();
  await siteHealth(hasDisplay);
  const samples = await search();
  await images(samples);
  await details(samples);
  if (!QUICK) await featured(hasDisplay);
  await saved();
  if (!QUICK) await slicer();
} catch (err) {
  record('smoke', 'run', 'FAIL', err instanceof Error ? err.message : String(err));
} finally {
  await stopServer();
}

const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped in ${Math.round((Date.now() - started) / 1000)} s`);
const failed = results.filter((r) => r.status === 'FAIL');
if (failed.length) {
  console.log('\nFailed:');
  for (const r of failed) console.log(`  ${r.area} / ${r.name}: ${r.info}`);
}
process.exit(failed.length ? 1 : 0);

// AnyStl launcher: owns the Next.js server and opens the URL in the user's
// default browser. A tiny SSE heartbeat server on PORT+1 tracks the tab —
// when it closes, the launcher tears down Next.js and exits.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import http from 'node:http';

const PORT = Number(process.env.PORT || 3000);
const HEARTBEAT_PORT = PORT + 1;
const URL = `http://localhost:${PORT}`;
const NO_OPEN = process.env.ANYSTL_NO_OPEN === '1';
const DISCONNECT_GRACE_MS = 2000;
const INITIAL_CONNECT_TIMEOUT_MS = 30_000;

const isWin = process.platform === 'win32';
const nextBin = isWin ? 'node_modules\\.bin\\next.cmd' : 'node_modules/.bin/next';

// A few sites only let a "real", visible browser through. On Linux, give the
// server an invisible virtual screen (Xvfb) to run that browser on, so no
// window ever pops up. Without Xvfb those sites are just skipped.
let xvfb = null;
function startXvfb() {
  if (process.platform !== 'linux' || process.env.ANYSTL_NO_XVFB === '1') return;
  const hasXvfb = (process.env.PATH || '').split(':').some((dir) => existsSync(`${dir}/Xvfb`));
  if (!hasXvfb) return;
  // First display number that isn't taken.
  let n = 99;
  while (n < 199 && (existsSync(`/tmp/.X${n}-lock`) || existsSync(`/tmp/.X11-unix/X${n}`))) n++;
  xvfb = spawn('Xvfb', [`:${n}`, '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  xvfb.on('error', () => { xvfb = null; });
  // Also on crashes, which skip shutdown(): never leave Xvfb running.
  process.on('exit', () => { try { xvfb?.kill(); } catch {} });
  process.env.ANYSTL_XVFB_DISPLAY = `:${n}`;
}
startXvfb();

const next = spawn(nextBin, ['start', '-p', String(PORT)], {
  stdio: 'inherit',
  shell: isWin,
  // Put next-server in its own process group so we can signal it along
  // with any scraper chromiums it spawns.
  detached: !isWin,
});

let shuttingDown = false;
let heartbeatEverConnected = false;
let disconnectTimer = null;
const heartbeatConnections = new Set();

function killNext(signal) {
  try {
    if (!next.pid) return;
    if (isWin) {
      const force = signal === 'SIGKILL' ? ['/F'] : [];
      spawn('taskkill', [...force, '/T', '/PID', String(next.pid)], {
        stdio: 'ignore',
        shell: true,
      });
    } else {
      process.kill(-next.pid, signal);
    }
  } catch {}
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try { heartbeatServer.close(); } catch {}
  for (const res of heartbeatConnections) {
    try { res.end(); } catch {}
  }
  heartbeatConnections.clear();
  if (next.exitCode === null) {
    killNext('SIGTERM');
    const timeout = sleep(5000).then(() => 'timeout');
    const exit = once(next, 'exit').then(() => 'exit');
    if (await Promise.race([timeout, exit]) === 'timeout') {
      killNext('SIGKILL');
    }
  }
  try { xvfb?.kill(); } catch {}
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
// Closing the terminal window sends SIGHUP; without this the detached
// Next.js server (and Xvfb) would be left running in the background.
process.on('SIGHUP', () => shutdown(0));
next.on('exit', (code) => shutdown(code ?? 0));

const heartbeatServer = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    });
    res.end();
    return;
  }
  if (req.url !== '/heartbeat') {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 15_000);

  heartbeatEverConnected = true;
  heartbeatConnections.add(res);
  if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }

  const onClose = () => {
    clearInterval(keepAlive);
    if (!heartbeatConnections.delete(res)) return;
    if (heartbeatConnections.size === 0 && heartbeatEverConnected && !shuttingDown) {
      disconnectTimer = setTimeout(() => {
        if (heartbeatConnections.size === 0 && !shuttingDown) shutdown(0);
      }, DISCONNECT_GRACE_MS);
    }
  };
  req.on('close', onClose);
  res.on('close', onClose);
});

heartbeatServer.on('error', (err) => {
  console.warn(`Heartbeat server could not bind on port ${HEARTBEAT_PORT}: ${err.message}`);
  console.warn('Automatic shutdown on tab close is disabled. Use Ctrl+C to stop.');
});
heartbeatServer.listen(HEARTBEAT_PORT, '127.0.0.1');

async function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (shuttingDown) return false;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.status < 500) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

// Candidate commands for opening a URL in the user's default browser, in
// order. On Linux, xdg-open can fail on minimal or tiling-WM setups (e.g. no
// portal / mime handler), so fall back to other openers before giving up.
function browserOpeners(url) {
  if (process.platform === 'darwin') return [['open', [url]]];
  // `start` is a cmd builtin. First quoted arg is the window title.
  if (isWin) return [['cmd', ['/c', 'start', '""', url]]];
  const openers = [];
  // $BROWSER may be a colon-separated list, per the sensible-browser convention.
  for (const cmd of (process.env.BROWSER || '').split(':').filter(Boolean)) {
    openers.push([cmd, [url]]);
  }
  openers.push(
    ['xdg-open', [url]],
    ['gio', ['open', url]],
    ['kde-open', [url]],
    ['sensible-browser', [url]],
    ['firefox', [url]],
    ['chromium', [url]],
    ['google-chrome', [url]],
  );
  return openers;
}

// Resolves true if the command started and exited 0 (or is still running
// after a few seconds, as some browsers stay in the foreground).
function tryOpen(cmd, args) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      child.unref();
      resolve(true);
    }, 5000);
    child.once('error', () => { clearTimeout(timer); resolve(false); });
    child.once('exit', (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}

async function openInDefaultBrowser(url) {
  for (const [cmd, args] of browserOpeners(url)) {
    if (await tryOpen(cmd, args)) return;
  }
  console.error('Could not open a browser automatically.');
  console.error(`Open this URL manually: ${url}`);
}

if (!NO_OPEN) {
  const ready = await waitForServer(URL);
  if (ready && !shuttingDown) {
    await openInDefaultBrowser(URL);
    setTimeout(() => {
      if (!heartbeatEverConnected && !shuttingDown) {
        console.warn(
          '\nNo browser heartbeat received. If the tab is open, automatic ' +
          'shutdown on close will not work — use Ctrl+C to stop.\n',
        );
      }
    }, INITIAL_CONNECT_TIMEOUT_MS);
  }
}

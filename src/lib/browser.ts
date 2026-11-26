import { chromium, Browser, BrowserContext, Page } from "playwright";

let browserInstance: Browser | null = null;
let contextInstance: BrowserContext | null = null;

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
  "--disable-infobars",
  "--window-size=1920,1080",
];

async function launchChromium(): Promise<Browser> {
  // Prefer Playwright's full Chromium ("new headless") build; fall back to
  // system Chrome or Edge when Playwright's browser download is unavailable.
  const channels: Array<"chromium" | "chrome" | "msedge"> =
    process.platform === "win32" ? ["chromium", "chrome", "msedge"] : ["chromium", "chrome"];
  let lastErr: unknown;
  for (const channel of channels) {
    try {
      return await chromium.launch({
        channel,
        headless: true,
        // Don't advertise that the browser is being automated.
        ignoreDefaultArgs: ["--enable-automation"],
        args: LAUNCH_ARGS,
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  contextInstance = null;
  browserInstance = await launchChromium();
  return browserInstance;
}

/** Create a context that looks like a regular desktop Chrome. */
export async function createStealthContext(browser: Browser): Promise<BrowserContext> {
  // Claim the real Chrome version so the user agent matches the engine.
  // Deliberately no faked navigator properties or timezone: bot checks look
  // for exactly those inconsistencies, and the real values pass fine.
  const major = browser.version().split(".")[0];
  const osToken =
    process.platform === "win32"
      ? "Windows NT 10.0; Win64; x64"
      : process.platform === "darwin"
        ? "Macintosh; Intel Mac OS X 10_15_7"
        : "X11; Linux x86_64";
  return browser.newContext({
    userAgent: `Mozilla/5.0 (${osToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
  });
}

let headfulBrowser: Browser | null = null;
let headfulContext: BrowserContext | null = null;

/**
 * A regular, visible Chromium for sites whose bot check (DataDome) rejects
 * headless browsers. It runs on the invisible Xvfb display the launcher
 * starts, so nothing shows up on screen. Unavailable without Xvfb.
 */
export async function getHeadfulContext(): Promise<BrowserContext> {
  const display = process.env.ANYSTL_XVFB_DISPLAY;
  if (!display) {
    throw new Error("needs a virtual display (install Xvfb, e.g. the xorg-server-xvfb package)");
  }
  if (!headfulBrowser || !headfulBrowser.isConnected()) {
    headfulContext = null;
    headfulBrowser = await chromium.launch({
      channel: "chromium",
      headless: false,
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        // Force X11 so the window lands on Xvfb, not the user's Wayland session.
        "--ozone-platform=x11",
        "--window-size=1920,1080",
      ],
      env: { ...process.env, DISPLAY: display, WAYLAND_DISPLAY: "" },
    });
  }
  headfulContext ??= await createStealthContext(headfulBrowser);
  return headfulContext;
}

/**
 * One long-lived context shared by all scrapes, so cookies from passed bot
 * checks (e.g. Cloudflare clearance) carry over to later searches.
 */
export async function getSharedContext(): Promise<BrowserContext> {
  const browser = await getBrowser();
  contextInstance ??= await createStealthContext(browser);
  return contextInstance;
}

// Interstitial titles: Cloudflare, generic checks, Yeggi, and DataDome (which
// titles its captcha page with just the bare domain, e.g. "turbosquid.com").
const CHALLENGE_TITLE = /just a moment|checking your browser|please wait|loading https?:|请稍候|^[a-z0-9-]+\.(com|net|io)$/i;

/** How long a fully loaded, non-challenge page may show no results before it counts as empty. */
const EMPTY_PAGE_GRACE_MS = 5_000;

/**
 * Waits for `selector` to appear, giving an interstitial bot check (which
 * usually clears itself after a few seconds of JS) time to finish first.
 * A real page that finished loading but still shows no results after a
 * short grace period is a search without matches, not a failure.
 */
export async function waitPastChallenge(page: Page, selector: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let loadedSince: number | null = null;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(
        (sel) => ({
          found: !!document.querySelector(sel),
          title: document.title,
          complete: document.readyState === "complete",
        }),
        selector,
      )
      .catch(() => null); // mid-navigation (e.g. the check redirecting)
    if (state?.found) return;
    if (state && state.complete && !CHALLENGE_TITLE.test(state.title)) {
      loadedSince ??= Date.now();
      if (Date.now() - loadedSince >= EMPTY_PAGE_GRACE_MS) return;
    } else {
      loadedSince = null;
    }
    await page.waitForTimeout(400);
  }
  const title = await page.title().catch(() => "");
  if (CHALLENGE_TITLE.test(title)) {
    throw new Error("blocked by the site's bot check, try again in a minute");
  }
  throw new Error("page didn't load in time");
}

// Consecutive bot-check failures per site, to spot a session that's stuck.
const challengeFailures = new Map<string, number>();

/**
 * Opens `url` and waits for `selector`. A first visit often lands on the bot
 * check, whose script sets a clearance cookie; the retry then gets through.
 * If a site fails twice in a row across searches, its (probably flagged)
 * cookies are dropped right away so the next search starts with a clean
 * session. Both tries together stay under the per-source time limit.
 */
export async function gotoPastChallenge(page: Page, url: string, selector: string): Promise<void> {
  const host = new URL(url).hostname.replace(/^www\./, "");

  const waits = [12_000, 15_000];
  for (let attempt = 0; ; attempt++) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    try {
      await waitPastChallenge(page, selector, waits[attempt]);
      challengeFailures.delete(host);
      return;
    } catch (err) {
      if (attempt >= waits.length - 1) {
        const failures = (challengeFailures.get(host) || 0) + 1;
        challengeFailures.set(host, failures);
        if (failures >= 2) {
          await page
            .context()
            .clearCookies({ domain: new RegExp(`(^|\\.)${host.replace(/\./g, "\\.")}$`) })
            .catch(() => {});
          challengeFailures.set(host, 0);
        }
        throw err;
      }
    }
  }
}

/** Opens each URL in `context` and waits for its bot check to clear. */
export async function warmUp(urls: string[], context: BrowserContext): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        for (let i = 0; i < 25 && CHALLENGE_TITLE.test(await page.title()); i++) {
          await page.waitForTimeout(1000);
        }
      } catch {
        // Best effort; the real search will try again anyway.
      } finally {
        await page.close().catch(() => {});
      }
    }),
  );
}

export async function closeBrowser() {
  contextInstance = null;
  headfulContext = null;
  await headfulBrowser?.close().catch(() => {});
  headfulBrowser = null;
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

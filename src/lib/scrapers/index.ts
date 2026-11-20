import { Page } from "playwright";
import { getHeadfulContext, getSharedContext, warmUp } from "../browser";
import { FeaturedResponse, FeaturedSection, HealthCheckEvent, ModelResult, Platform, SiteCheck } from "../types";
import { recordOutcome, siteHealth } from "../health";
import { sortByScore } from "../scoring";
import { PLATFORMS } from "../platforms";
import { availableSearchPlatforms } from "../sourceAvailability";
import { mergeUnique } from "./common";
import { featuredMakerWorld, searchMakerWorld } from "./makerworld";
import { featuredPrintables, searchPrintables } from "./printables";
import { featuredThingiverse, searchThingiverse, searchThingiverseApi } from "./thingiverse";
import { featuredCreality, searchCreality } from "./creality";
import { featuredMakeronline, searchMakeronline } from "./makeronline";
import { featuredSketchfab, searchSketchfab } from "./sketchfab";
import { featuredGrabCad, searchGrabCad } from "./grabcad";
import { featuredTinkercad, searchTinkercad } from "./tinkercad";
import { featuredPinshape, searchPinshape } from "./pinshape";
import { featuredThangs, searchThangs } from "./thangs";
import { featuredYeggi, searchYeggi } from "./yeggi";
import { featuredNexprint, searchNexprint } from "./nexprint";
import { featuredCgTrader, searchCgTrader, searchCgTraderApi } from "./cgtrader";
import { featuredBlenderKit, searchBlenderKit } from "./blenderkit";
import { featuredBlendSwap, searchBlendSwap } from "./blendswap";
import { featuredPolyHaven, searchPolyHaven } from "./polyhaven";
import { featuredWarehouse3d, searchWarehouse3d } from "./warehouse3d";
import { featuredMyMiniFactory, getMyMiniFactoryIndex, searchMyMiniFactory, searchMyMiniFactoryApi } from "./myminifactory";
import { featuredCadNav, searchCadNav } from "./cadnav";
import { featuredTurboSquid, searchTurboSquid } from "./turbosquid";
import { featuredFree3d, searchFree3d } from "./free3d";
import { searchCults3d } from "./cults3d";
import { searchWikimedia } from "./wikimedia";
import { searchTraceParts } from "./traceparts";

export interface SearchResult {
  results: ModelResult[];
  errors: string[];
  /** Sources that returned nothing for this page, i.e. have no more results. */
  exhausted: Platform[];
  /** Sources that errored this time (worth retrying on the next page). */
  failed: Platform[];
}

interface Source {
  platform: Platform;
  /** Sources behind bot protection need a real browser page to work from. */
  needsBrowser: boolean;
  /** Needs the visible (Xvfb) browser rather than the headless one. */
  headful?: boolean;
  search: (page: Page, query: string, pageNo: number) => Promise<ModelResult[]>;
  /** Optional API-first search; null asks us to use the regular search. */
  searchApi?: (query: string, pageNo: number) => Promise<ModelResult[] | null>;
  featured?: (page: Page) => Promise<ModelResult[]>;
  /** A page to visit ahead of time so its bot check is already passed. */
  warmupUrl?: string;
  /** Search word for the health check when the site has nothing for the usual one. */
  checkQuery?: string;
}

/** A source slower than this is reported as timed out instead of holding up the rest. */
const SOURCE_TIMEOUT_MS = 30_000;

// Circuit breaker: a site whose bot check keeps rejecting us (or that keeps
// timing out) is skipped for a while, so it doesn't slow every search down.
// Three strikes: after the second, gotoPastChallenge already resets the
// site's cookies, so the third attempt runs on a clean session.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000;
const breaker = new Map<Platform, { failures: number; openUntil: number }>();
const isBlockage = (err: unknown) => /bot check|timed out|didn't load/i.test(err instanceof Error ? err.message : String(err));

const SOURCES: Source[] = [
  { platform: "makerworld", needsBrowser: true, search: searchMakerWorld, featured: featuredMakerWorld, warmupUrl: "https://makerworld.com/en" },
  { platform: "thingiverse", needsBrowser: true, search: searchThingiverse, searchApi: searchThingiverseApi, featured: featuredThingiverse },
  { platform: "printables", needsBrowser: false, search: (_, q, n) => searchPrintables(q, n), featured: featuredPrintables },
  { platform: "creality", needsBrowser: false, search: (_, q, n) => searchCreality(q, n), featured: featuredCreality },
  { platform: "makeronline", needsBrowser: false, search: (_, q, n) => searchMakeronline(q, n), featured: featuredMakeronline },
  { platform: "sketchfab", needsBrowser: false, search: (_, q, n) => searchSketchfab(q, n), featured: featuredSketchfab },
  { platform: "grabcad", needsBrowser: false, search: (_, q, n) => searchGrabCad(q, n), featured: featuredGrabCad },
  { platform: "tinkercad", needsBrowser: false, search: (_, q, n) => searchTinkercad(q, n), featured: featuredTinkercad },
  { platform: "pinshape", needsBrowser: false, search: (_, q, n) => searchPinshape(q, n), featured: featuredPinshape },
  { platform: "thangs", needsBrowser: true, search: searchThangs, featured: featuredThangs, warmupUrl: "https://thangs.com/" },
  { platform: "cgtrader", needsBrowser: true, search: searchCgTrader, searchApi: searchCgTraderApi, featured: featuredCgTrader, warmupUrl: "https://www.cgtrader.com/" },
  { platform: "blenderkit", needsBrowser: false, search: (_, q, n) => searchBlenderKit(q, n), featured: featuredBlenderKit },
  { platform: "blendswap", needsBrowser: false, search: (_, q, n) => searchBlendSwap(q, n), featured: featuredBlendSwap },
  { platform: "polyhaven", needsBrowser: false, search: (_, q, n) => searchPolyHaven(q, n), featured: featuredPolyHaven },
  { platform: "warehouse3d", needsBrowser: false, search: (_, q, n) => searchWarehouse3d(q, n), featured: featuredWarehouse3d },
  { platform: "myminifactory", needsBrowser: false, search: (_, q, n) => searchMyMiniFactory(q, n), searchApi: searchMyMiniFactoryApi, featured: featuredMyMiniFactory },
  { platform: "cults3d", needsBrowser: false, search: (_, q, n) => searchCults3d(q, n) },
  { platform: "wikimedia", needsBrowser: false, search: (_, q, n) => searchWikimedia(q, n) },
  { platform: "traceparts", needsBrowser: false, search: (_, q, n) => searchTraceParts(q, n), checkQuery: "" },
  { platform: "turbosquid", needsBrowser: true, headful: true, search: searchTurboSquid, featured: featuredTurboSquid, warmupUrl: "https://www.turbosquid.com/" },
  { platform: "free3d", needsBrowser: true, headful: true, search: searchFree3d, featured: featuredFree3d, warmupUrl: "https://free3d.com/" },
  { platform: "cadnav", needsBrowser: false, search: (_, q, n) => searchCadNav(q, n), featured: featuredCadNav, checkQuery: "chair" },
  { platform: "nexprint", needsBrowser: false, search: (_, q, n) => searchNexprint(q, n), featured: featuredNexprint },
  { platform: "yeggi", needsBrowser: true, search: searchYeggi, featured: featuredYeggi, warmupUrl: "https://www.yeggi.com/" },
];

function searchSources(platforms?: Platform[]): Source[] {
  const available = availableSearchPlatforms();
  return SOURCES.filter((s) => available.includes(s.platform) && (!platforms || platforms.includes(s.platform)));
}

type WithPage = (task: (page: Page) => Promise<ModelResult[]>) => Promise<ModelResult[]>;

async function searchSource(source: Source, withPage: WithPage, query: string, pageNo: number): Promise<ModelResult[]> {
  const results = await source.searchApi?.(query, pageNo);
  return results ?? withPage((page) => source.search(page, query, pageNo));
}

/** Runs tasks in parallel, opening a page only when required by the task. */
async function runAll(
  kind: SiteCheck["kind"],
  task: (source: Source, withPage: WithPage) => Promise<ModelResult[]>,
  sources: Source[],
  onSettled?: (platform: Platform, result: PromiseSettledResult<ModelResult[]>, check?: SiteCheck) => void,
): Promise<Array<{ platform: Platform; result: PromiseSettledResult<ModelResult[]> }>> {
  let sharedContext: ReturnType<typeof getSharedContext> | undefined;
  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const state = breaker.get(source.platform);
      const remaining = (state?.openUntil ?? 0) - Date.now();
      const skipped = remaining > 0
        ? new Error(`skipped for ${Math.ceil(remaining / 60_000)} min, the site keeps blocking automated searches`)
        : null;
      // A blocked scraper shouldn't prevent its independent API from recovering.
      if (skipped && (!source.searchApi || kind === "featured")) {
        onSettled?.(source.platform, { status: "rejected", reason: skipped });
        throw skipped;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const workState: { page?: Page; finished: boolean } = { finished: false };
      const timeout = () => new Error("timed out, try again");
      const withPage: WithPage = async (work) => {
        if (skipped) throw skipped;
        if (source.needsBrowser) {
          if (workState.finished) throw timeout();
          const context = await (source.headful ? getHeadfulContext() : (sharedContext ??= getSharedContext()));
          if (workState.finished) throw timeout();
          const opened = await context.newPage();
          if (workState.finished) {
            await opened.close().catch(() => {});
            throw timeout();
          }
          workState.page = opened;
        }
        // Non-browser sources ignore the page argument.
        return work(workState.page ?? (null as unknown as Page));
      };

      const started = Date.now();
      try {
        const results = await Promise.race([
          task(source, withPage),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(timeout()), SOURCE_TIMEOUT_MS);
          }),
        ]);
        if (!skipped) breaker.delete(source.platform);
        const check = recordOutcome(source.platform, kind, Date.now() - started, { results });
        onSettled?.(source.platform, { status: "fulfilled", value: results }, check);
        return results;
      } catch (err) {
        if (err === skipped && skipped) {
          onSettled?.(source.platform, { status: "rejected", reason: skipped });
          throw skipped;
        }
        if (isBlockage(err)) {
          const failures = (breaker.get(source.platform)?.failures || 0) + 1;
          breaker.set(source.platform, {
            failures,
            openUntil: failures >= BREAKER_THRESHOLD ? Date.now() + BREAKER_COOLDOWN_MS : 0,
          });
        }
        const check = recordOutcome(source.platform, kind, Date.now() - started, { error: err });
        onSettled?.(source.platform, { status: "rejected", reason: err }, check);
        throw err;
      } finally {
        workState.finished = true;
        clearTimeout(timer);
        // Closing the page also stops a timed-out scrape that's still running.
        await workState.page?.close().catch(() => {});
      }
    }),
  );
  return sources.map((source, i) => ({ platform: source.platform, result: settled[i]! }));
}

function errorMessage(platform: Platform, reason: unknown): string {
  const msg = `${PLATFORMS[platform].name}: ${reason instanceof Error ? reason.message : reason}`;
  console.error(msg);
  return msg;
}

/**
 * Page `pageNo` of results for `query` from every source, or only from
 * `platforms` when given (the client drops sources that ran out).
 */
export async function searchAll(query: string, pageNo = 1, platforms?: Platform[]): Promise<SearchResult> {
  const sources = searchSources(platforms);
  const settled = await runAll("search", (source, withPage) => searchSource(source, withPage, query, pageNo), sources);

  const lists: ModelResult[][] = [];
  const errors: string[] = [];
  const exhausted: Platform[] = [];
  const failed: Platform[] = [];
  for (const { platform, result } of settled) {
    if (result.status === "fulfilled") {
      lists.push(result.value);
      if (result.value.length === 0) exhausted.push(platform);
    } else {
      errors.push(errorMessage(platform, result.reason));
      failed.push(platform);
    }
  }

  return { results: sortByScore(mergeUnique(lists)), errors, exhausted, failed };
}

/** One source's part of a streamed search. */
export interface SourceOutcome {
  platform: Platform;
  results: ModelResult[];
  /** "empty" means the source has no (more) results for this query. */
  status: "ok" | "empty" | "failed";
  error?: string;
}

/**
 * Like searchAll, but reports each source as soon as it finishes instead of
 * waiting for the slowest one.
 */
export async function searchStream(
  query: string,
  pageNo: number,
  platforms: Platform[] | undefined,
  onSource: (outcome: SourceOutcome) => void,
): Promise<void> {
  const sources = searchSources(platforms);
  await runAll("search", (source, withPage) => searchSource(source, withPage, query, pageNo), sources, (platform, result) => {
    if (result.status === "fulfilled") {
      onSource({
        platform,
        // Kept in the site's own order; the client ranks across sites.
        results: mergeUnique([result.value]),
        status: result.value.length === 0 ? "empty" : "ok",
      });
    } else {
      onSource({ platform, results: [], status: "failed", error: errorMessage(platform, result.reason) });
    }
  });
}

/** A query every site has plenty of results for. */
const CHECK_QUERY = "vase";

/**
 * Searches every site for a common word and reports each as it answers, to
 * tell sites that are down or blocking from scrapers broken by a redesign.
 */
export async function checkSites(onSite: (event: HealthCheckEvent) => void): Promise<void> {
  await runAll("check", (source, withPage) => searchSource(source, withPage, source.checkQuery ?? CHECK_QUERY, 1), searchSources(), (platform, result, check) => {
    if (check) onSite({ type: "site", platform, check });
    else if (result.status === "rejected") onSite({ type: "skipped", platform, error: String(result.reason?.message || result.reason) });
  }).catch(() => {});
}

/** Recent results per site, plus which ones are being skipped. */
export function getSiteHealth() {
  return siteHealth((p) => {
    const state = breaker.get(p);
    return state && state.openUntil > Date.now() ? state.openUntil : 0;
  });
}

const FEATURED_TTL_MS = 30 * 60 * 1000;
let featuredCache: FeaturedResponse | null = null;
let featuredInFlight: Promise<FeaturedResponse> | null = null;

async function fetchFeatured(): Promise<FeaturedResponse> {
  const sources = SOURCES.filter((source) => source.featured !== undefined);
  const settled = await runAll("featured", (source, withPage) => withPage(source.featured!), sources);
  const sections: FeaturedSection[] = settled.map(({ platform, result }) =>
    result.status === "fulfilled"
      ? { platform, results: result.value }
      : { platform, results: [], error: errorMessage(platform, result.reason) },
  );
  return { sections, fetchedAt: Date.now() };
}

/** Featured/trending models from every platform, cached for 30 minutes. */
export async function featuredAll(forceRefresh = false): Promise<FeaturedResponse> {
  const fresh = featuredCache && Date.now() - featuredCache.fetchedAt < FEATURED_TTL_MS;
  if (fresh && !forceRefresh) return featuredCache!;

  // Collapse concurrent requests (e.g. two open tabs) into one scrape.
  featuredInFlight ??= fetchFeatured()
    .then((data) => {
      featuredCache = data;
      return data;
    })
    .finally(() => {
      featuredInFlight = null;
    });
  return featuredInFlight;
}

let warmedUp: Promise<void> | null = null;

/**
 * Visits the bot-checked sites once in the background (e.g. while the user
 * is still typing) so the first real search doesn't pay for the checks.
 */
export function warmUpSources(): Promise<void> {
  const urls = (headful: boolean) =>
    SOURCES.flatMap((s) => (s.warmupUrl && !!s.headful === headful ? [s.warmupUrl] : []));
  warmedUp ??= Promise.all([
    getSharedContext().then((context) => warmUp(urls(false), context)),
    // Only when a virtual display exists; otherwise those sources are skipped.
    process.env.ANYSTL_XVFB_DISPLAY ? getHeadfulContext().then((context) => warmUp(urls(true), context)) : null,
    // Builds (or loads from disk) the MyMiniFactory model index.
    getMyMiniFactoryIndex(),
  ]).then(() => {}).catch((err) => {
    console.error("Warm-up failed:", err);
    warmedUp = null;
  });
  return warmedUp;
}

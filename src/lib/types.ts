export type Platform =
  | "makerworld"
  | "thingiverse"
  | "printables"
  | "creality"
  | "makeronline"
  | "sketchfab"
  | "grabcad"
  | "tinkercad"
  | "pinshape"
  | "thangs"
  | "nexprint"
  | "cgtrader"
  | "blenderkit"
  | "polyhaven"
  | "blendswap"
  | "warehouse3d"
  | "myminifactory"
  | "cults3d"
  | "wikimedia"
  | "traceparts"
  | "cadnav"
  | "turbosquid"
  | "free3d"
  | "yeggi";

export interface ModelResult {
  title: string;
  url: string;
  thumbnail: string;
  likes: number;
  downloads: number | null;
  platform: Platform;
  /** For aggregator results (Yeggi): the site that actually hosts the model. */
  via?: string;
  /** Price label for marketplaces, e.g. "Free" or "$79". */
  price?: string;
  isAI: boolean;
  score: number;
  /** Client-side only: the same model found on other sites (merged duplicates). */
  alternates?: ModelResult[];
}

export type SortOption =
  /** Each result ranked against its own site's results (percentile), so big sites don't swamp small ones. */
  | "fair"
  /** Saved page only: newest saved first. */
  | "newest"
  | "likes-desc"
  | "likes-asc"
  | "downloads-desc"
  | "downloads-asc";

export interface SearchResponse {
  query: string;
  page: number;
  results: ModelResult[];
  /** Sources with no further results; leave them out of later pages. */
  exhausted: Platform[];
  /** Sources that errored on this page; still worth asking next time. */
  failed: Platform[];
  errors?: string[];
}

/** One line of the streamed search (/api/search/stream). */
export type SearchStreamEvent =
  | {
      type: "source";
      platform: Platform;
      results: ModelResult[];
      status: "ok" | "empty" | "failed";
      error?: string;
    }
  | { type: "done"; page: number }
  | { type: "error"; error: string };

/** Extra facts about a model, read from its page for the quick preview. */
export interface ModelDetails {
  url: string;
  author?: string;
  description?: string;
  /** Larger images than the search thumbnail, when the page has them. */
  images: string[];
  /** e.g. "CC BY-NC 4.0", "Standard Digital File License". */
  license?: string;
  /** Upper-case file extensions mentioned by the page, e.g. ["STL", "3MF"]. */
  formats: string[];
  /** Set when the page couldn't be read (bot check etc.). */
  error?: string;
}

export interface FeaturedSection {
  platform: Platform;
  results: ModelResult[];
  error?: string;
}

export interface FeaturedResponse {
  sections: FeaturedSection[];
  fetchedAt: number;
}

export interface SavedModel extends ModelResult {
  savedAt: number;
  note?: string;
  collections?: string[];
  /** Picked up from the quick preview. */
  license?: string;
  formats?: string[];
  /** Result of the last "check links" run. */
  linkStatus?: "ok" | "dead" | "unknown";
  checkedAt?: number;
}

/** One site's answer to one search, Featured load or health check. */
export interface SiteCheck {
  at: number;
  kind: "search" | "featured" | "check";
  /** How long the site took to answer. */
  ms: number;
  status: "ok" | "empty" | "failed";
  count: number;
  error?: string;
  /** Results came back but look wrong (no images, broken titles…): the scraper may need fixing. */
  warnings?: string[];
}

export interface SiteHealth {
  platform: Platform;
  /** Newest first. */
  recent: SiteCheck[];
  /** Set while the site is skipped for blocking automated searches. */
  blockedUntil?: number;
}

/** One line of the streamed health check (/api/health/check). */
export type HealthCheckEvent =
  | { type: "site"; platform: Platform; check: SiteCheck }
  | { type: "skipped"; platform: Platform; error: string }
  | { type: "done" };

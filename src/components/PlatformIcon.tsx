"use client";

import { Platform } from "@/lib/types";
import { PLATFORMS } from "@/lib/platforms";

/** A little filament spool in the site's colour. */
export function SpoolDot({ platform, size = 12, muted }: { platform: Platform; size?: number; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: muted ? "#4a413b" : PLATFORMS[platform].color,
        boxShadow: `inset 0 0 0 ${Math.max(2, Math.round(size / 3.5))}px rgba(0,0,0,0.28)`,
      }}
    />
  );
}

/** Site label shown on a model card's thumbnail. */
export function PlatformBadge({ platform, via }: { platform: Platform; via?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-spool-bg/85 py-1 pl-1.5 pr-2.5 text-xs font-semibold text-spool-text backdrop-blur-sm">
      <SpoolDot platform={platform} size={12} />
      <span className="truncate">
        {PLATFORMS[platform].name}
        {via && <span className="font-normal text-spool-muted"> · {via}</span>}
      </span>
    </span>
  );
}

/** A site chip with an optional count, used for filters. */
export function PlatformPill({ platform, count }: { platform: Platform; count?: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-spool-chip py-1.5 pl-2 pr-3.5 text-sm text-spool-text">
      <SpoolDot platform={platform} size={14} />
      {PLATFORMS[platform].name}
      {count !== undefined && <span className="font-mono text-xs text-spool-muted">{count}</span>}
    </span>
  );
}

"use client";

import { EXTERNAL_SEARCHES, OPTIONAL_SEARCH_PLATFORMS, PLATFORMS } from "@/lib/platforms";
import { Platform } from "@/lib/types";

interface Props {
  query: string;
  /** Sources that failed this search; offered as links too when they have one. */
  failed?: Platform[];
  searched?: Platform[];
}

/** Links that run the current search directly on the provider's site. */
export function ExternalSearchLinks({ query, failed = [], searched = [] }: Props) {
  if (!query) return null;
  const externalPlatforms = [...new Set([...failed, ...OPTIONAL_SEARCH_PLATFORMS.filter((p) => !searched.includes(p))])];
  const links = [
    ...externalPlatforms.flatMap((p) => {
      const url = PLATFORMS[p].searchUrl;
      return url ? [{ name: PLATFORMS[p].name, url }] : [];
    }),
    ...EXTERNAL_SEARCHES,
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="text-spool-muted">Search directly on:</span>
      {links.map(({ name, url }) => (
        <a
          key={name}
          href={url(query)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-spool-accent-soft hover:text-spool-text"
        >
          {name} ↗
        </a>
      ))}
    </div>
  );
}

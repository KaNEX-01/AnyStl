"use client";

import { EXTERNAL_SEARCHES, PLATFORMS } from "@/lib/platforms";
import { Platform } from "@/lib/types";

interface Props {
  query: string;
  /** Sources that failed this search; offered as links too when they have one. */
  failed?: Platform[];
}

/** Links that run the current search on sites AnyStl can't reach itself. */
export function ExternalSearchLinks({ query, failed = [] }: Props) {
  if (!query) return null;
  const links = [
    ...failed.flatMap((p) => {
      const url = PLATFORMS[p].searchUrl;
      return url ? [{ name: PLATFORMS[p].name, url }] : [];
    }),
    ...EXTERNAL_SEARCHES,
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="text-spool-muted">Not searched here:</span>
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

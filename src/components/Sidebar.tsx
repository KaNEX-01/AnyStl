"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSaved } from "@/lib/useSaved";
import { useViewed } from "@/lib/useViewed";
import { useSearchProgress } from "@/lib/useResultCounts";
import { useSourceFilter } from "@/lib/useSourceFilter";
import { PLATFORM_ORDER } from "@/lib/platforms";
import { SourceFilter } from "./SourceFilter";
import { LogoMark } from "./LogoMark";

const TABS = [
  { href: "/", label: "Search" },
  { href: "/featured", label: "Featured" },
  { href: "/saved", label: "Saved" },
  { href: "/opened", label: "Opened" },
  { href: "/health", label: "Site health" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 hover:opacity-90" aria-label="AnyStl home">
      <LogoMark size={38} />
      <span className="text-[22px] font-bold tracking-tight text-spool-text">AnyStl</span>
    </Link>
  );
}

function NavLinks({ vertical }: { vertical?: boolean }) {
  const pathname = usePathname();
  const { saved, loaded } = useSaved();
  const { viewed } = useViewed();
  return (
    <nav className={vertical ? "flex flex-col gap-1" : "flex gap-1"}>
      {TABS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-spool-line-soft text-spool-text" : "text-spool-muted hover:bg-spool-chip hover:text-spool-text"
            }`}
          >
            {label}
            {href === "/saved" && loaded && saved.length > 0 && (
              <span className="font-mono text-xs text-spool-accent-soft">{saved.length}</span>
            )}
            {href === "/opened" && viewed.length > 0 && (
              <span className="font-mono text-xs text-spool-muted">{viewed.length}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** App navigation plus the site filter: a sidebar on wide screens, a top bar on phones. */
export function Sidebar() {
  const pathname = usePathname();
  const progress = useSearchProgress();
  const { enabled } = useSourceFilter();
  const [filterOpen, setFilterOpen] = useState(false);
  // The filter applies to searching and to Featured; Saved has its own chips.
  const showFilter = pathname === "/" || pathname === "/featured";
  const filter = <SourceFilter progress={pathname === "/" ? progress : null} />;

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[300px] shrink-0 flex-col gap-6 overflow-y-auto bg-spool-side px-5 py-7 lg:flex">
        <Logo />
        <NavLinks vertical />
        {showFilter && (
          <>
            <div className="h-px bg-spool-line-soft" />
            {filter}
          </>
        )}
      </aside>

      <header className="sticky top-0 z-40 border-b border-spool-line-soft bg-spool-side/95 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <Logo />
          <span className="flex-grow" />
          {showFilter && (
            <button
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                filterOpen ? "bg-spool-accent text-spool-side" : "bg-spool-chip text-spool-text"
              }`}
            >
              Sites <span className="font-mono text-xs opacity-80">{enabled.length}/{PLATFORM_ORDER.length}</span>
            </button>
          )}
        </div>
        <div className="px-3 pb-2">
          <NavLinks />
        </div>
        {showFilter && filterOpen && <div className="max-h-[70vh] overflow-y-auto border-t border-spool-line-soft px-4 py-4">{filter}</div>}
      </header>
    </>
  );
}

"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSaved } from "@/lib/useSaved";
import { useViewed } from "@/lib/useViewed";
import { useSearchProgress } from "@/lib/useResultCounts";
import { useSourceFilter } from "@/lib/useSourceFilter";
import { PLATFORMS } from "@/lib/platforms";
import { SourceFilter } from "./SourceFilter";
import { LogoMark } from "./LogoMark";

const COLLAPSE_KEY = "anystl.sidebarCollapsed";
const collapseListeners = new Set<() => void>();

function subscribeCollapsed(listener: () => void) {
  collapseListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    collapseListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

const serverCollapsed = () => false;

const TABS = [
  { href: "/", label: "Search", icon: "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" },
  { href: "/featured", label: "Featured", icon: "M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.3 6.7 19.1l1-5.8L3.5 9.2l5.9-.9L12 3z" },
  { href: "/saved", label: "Saved", icon: "M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" },
  { href: "/opened", label: "Opened", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/health", label: "Site health", icon: "M4 12h4l2.5-6 3 12 2.5-6H20" },
  { href: "/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

function Logo({ compact, onReset }: { compact?: boolean; onReset?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onReset}
      className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
      aria-label="AnyStl home"
    >
      <LogoMark size={compact ? 28 : 30} />
      {!compact && <span className="text-[19px] font-bold tracking-tight text-spool-text">AnyStl</span>}
    </Link>
  );
}

function NavLinks({
  vertical,
  compact,
  onResetHome,
}: {
  vertical?: boolean;
  compact?: boolean;
  onResetHome?: () => void;
}) {
  const pathname = usePathname();
  const { saved, loaded } = useSaved();
  const { viewed } = useViewed();
  return (
    <nav className={vertical ? "flex flex-col gap-0.5" : "flex gap-1 overflow-x-auto"}>
      {TABS.map(({ href, label, icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={href === "/" && active ? onResetHome : undefined}
            aria-current={active ? "page" : undefined}
            title={compact ? label : undefined}
            className={`flex shrink-0 items-center ${
              compact ? "justify-center px-2 py-2.5" : "justify-between gap-2.5 px-3 py-2"
            } rounded-xl text-[13.5px] font-medium transition-colors ${
              active
                ? "bg-spool-line-soft/90 text-spool-text"
                : "text-spool-muted hover:bg-spool-chip/70 hover:text-spool-text"
            }`}
          >
            {compact ? (
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
              </svg>
            ) : (
              <>
                <span className="flex items-center gap-2.5">
                  <svg
                    className={`h-4 w-4 shrink-0 ${active ? "text-spool-accent" : "text-spool-dim"}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
                  </svg>
                  {label}
                </span>
                {href === "/saved" && loaded && saved.length > 0 && (
                  <span className="font-mono text-[11px] text-spool-accent-soft">{saved.length}</span>
                )}
                {href === "/opened" && viewed.length > 0 && (
                  <span className="font-mono text-[11px] text-spool-dim">{viewed.length}</span>
                )}
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** App navigation plus the site filter: a collapsible sidebar on wide screens, a top bar on phones. */
export function Sidebar() {
  const pathname = usePathname();
  const progress = useSearchProgress();
  const { available, isEnabled } = useSourceFilter();
  const [filterOpen, setFilterOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, serverCollapsed);

  const toggleCollapsed = () => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      // Ignore storage access errors in restricted WebViews.
    }
    collapseListeners.forEach((l) => l());
  };

  const resetHome = () => {
    if (pathname === "/") {
      window.dispatchEvent(new Event("anystl:home"));
    }
  };

  // The filter applies to searching and to Featured; Saved has its own chips.
  const showFilter = pathname === "/" || pathname === "/featured";
  const platforms = pathname === "/featured" ? available.filter((p) => PLATFORMS[p].featuredLabel) : available;
  const enabledCount = platforms.filter(isEnabled).length;
  const filter = <SourceFilter platforms={platforms} progress={pathname === "/" ? progress : null} />;

  return (
    <>
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col gap-5 overflow-y-auto border-r border-spool-line-soft/50 bg-spool-side/85 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[64px] items-center px-2 py-5" : "w-[264px] px-4 py-5"
        }`}
      >
        <div className={`flex w-full items-center ${collapsed ? "flex-col gap-3" : "justify-between gap-2 px-1"}`}>
          <Logo compact={collapsed} onReset={resetHome} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar for a wider view"}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-spool-dim transition-colors hover:bg-spool-chip hover:text-spool-text"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={collapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7M19 19l-7-7 7-7"}
              />
            </svg>
          </button>
        </div>

        <div className="w-full">
          <NavLinks vertical compact={collapsed} onResetHome={resetHome} />
        </div>

        {showFilter && !collapsed && (
          <>
            <div className="h-px bg-spool-line-soft/60" />
            {filter}
          </>
        )}

        {showFilter && collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            title={`Show sites (${enabledCount}/${platforms.length} active)`}
            className="mt-auto flex flex-col items-center gap-0.5 rounded-xl border border-spool-line-soft/70 bg-spool-chip/70 px-2 py-2 font-mono text-[10px] text-spool-muted transition-colors hover:border-spool-line hover:text-spool-text"
          >
            <span className="text-spool-accent-soft">{enabledCount}</span>
            <span>/{platforms.length}</span>
          </button>
        )}
      </aside>

      <header className="sticky top-0 z-40 border-b border-spool-line-soft/70 bg-spool-side/95 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Logo onReset={resetHome} />
          <span className="flex-grow" />
          {showFilter && (
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filterOpen
                  ? "bg-spool-accent text-spool-side"
                  : "border border-spool-line-soft bg-spool-chip text-spool-text"
              }`}
            >
              Sites <span className="font-mono text-[11px] opacity-80">{enabledCount}/{platforms.length}</span>
            </button>
          )}
        </div>
        <div className="px-3 pb-2">
          <NavLinks onResetHome={resetHome} />
        </div>
        {showFilter && filterOpen && (
          <div className="max-h-[70vh] overflow-y-auto border-t border-spool-line-soft/70 px-4 py-4">{filter}</div>
        )}
      </header>
    </>
  );
}

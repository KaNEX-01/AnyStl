"use client";

import type { ReactNode } from "react";
import type { Platform } from "@/lib/types";
import { SearchPlatformsContext } from "@/lib/useSourceFilter";

export function SearchPlatformsProvider({ platforms, children }: { platforms: Platform[]; children: ReactNode }) {
  return <SearchPlatformsContext.Provider value={platforms}>{children}</SearchPlatformsContext.Provider>;
}

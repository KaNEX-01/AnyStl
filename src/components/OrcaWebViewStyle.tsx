"use client";

import { useEffect } from "react";

/** Orca styles bare elements on every page; those unlayered rules override Tailwind utilities. */
export function OrcaWebViewStyle() {
  useEffect(() => {
    if (!document.documentElement.hasAttribute("data-orca-theme")) return;
    document.getElementById("orca-plugin-defaults")?.remove();
  }, []);
  return null;
}

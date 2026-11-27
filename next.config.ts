import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "*": ["./desktop/**", "./.git/**", "./orcaslicer/**", "./docs/**"],
  },
};

export default nextConfig;

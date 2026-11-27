import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "*": ["./desktop/**", "./.git/**", "./orcaslicer/**"],
  },
};

export default nextConfig;

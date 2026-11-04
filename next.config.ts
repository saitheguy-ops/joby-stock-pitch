import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components: pages render a static shell; live data streams in at request
  // time and is cached per data source with `use cache` + cacheLife (see src/lib).
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["yahoo-finance2"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

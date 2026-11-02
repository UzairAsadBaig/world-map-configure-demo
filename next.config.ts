import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: `next build` writes a self-contained site to out/ that can be
  // served from S3/CloudFront. All data is fetched directly by the browser.
  // (create-next-app enabled `cacheComponents`/`partialPrefetching`; both need a
  // Next.js server and fail with "PPR cannot be enabled in export mode".)
  output: "export",
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

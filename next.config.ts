import path from "node:path";
import type { NextConfig } from "next";

const root = path.dirname(new URL(import.meta.url).pathname);

// Whisper runs on several threads only when the page is cross-origin
// isolated. Render sets these headers on the static site (render.yaml); the
// dev server sets them here.
const isolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  // every page exports as a folder with an index.html, which any static host serves
  trailingSlash: true,
  outputFileTracingRoot: root,
  turbopack: { root },
  ...(process.env.NODE_ENV === "production" ? {} : { headers: async () => [{ source: "/:path*", headers: isolation }] }),
};

export default nextConfig;

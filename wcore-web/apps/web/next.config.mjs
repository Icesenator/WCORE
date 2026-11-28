import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHeaders } from "./lib/security-headers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Monorepo: without this, Next emits the standalone server at
  // .next/standalone/server.js (tracing root = app dir), but the CI webServer
  // and the postbuild script expect .next/standalone/apps/web/server.js.
  // Pointing to the pnpm workspace root restores the apps/web prefix.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  reactStrictMode: true,
  transpilePackages: ["@wcore/shared"],
  typedRoutes: false,
  // Matching of routes AND of header `source` patterns becomes case-sensitive. Without it Next.js matches
  // case-insensitively and applies headers before resolving the route, so /CMC/crypto/bubbles/EMBED would
  // receive the embed framing exception while rendering the generic 404 (see lib/security-headers.mjs).
  // Consequence: a URL with a capital letter in a static segment (e.g. /Profile) is now a 404.
  experimental: { caseSensitiveRoutes: true },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "assets.coingecko.com" },
    ],
  },
  async headers() {
    return buildHeaders();
  },
};

export default nextConfig;

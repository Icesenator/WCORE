import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHeaders } from "./security-headers.mjs";

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

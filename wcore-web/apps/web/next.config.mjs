import path from "node:path";
import { fileURLToPath } from "node:url";

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
    return [{
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        // The API and the relay both send a CSP; the web app sent none at all.
        //
        // Only the directives that cannot break resource loading are enforced here.
        // script-src, connect-src, img-src and style-src are deliberately left out:
        // Next.js hydration relies on inline scripts, wagmi and WalletConnect open
        // websockets to a moving set of relays, and chain and token icons are pulled
        // from a dozen CDNs. Guessing those values would take the site down, and a
        // policy that has to be reverted protects nobody. Tightening them needs
        // nonce-based scripts and a measured connect/img inventory, ideally staged
        // through Content-Security-Policy-Report-Only first.
        {
          key: "Content-Security-Policy",
          value: [
            "frame-ancestors 'none'", // clickjacking, the modern form of X-Frame-Options
            "base-uri 'self'",        // blocks <base> injection redirecting relative URLs
            "form-action 'self'",     // blocks form-based exfiltration to another origin
            "object-src 'none'",      // no plugin content
          ].join("; "),
        },
        // Wallet extensions and WalletConnect rely on popups, so full same-origin
        // isolation is not an option here.
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      ],
    }];
  },
};

export default nextConfig;

// Security headers of the web app, kept apart from next.config.mjs so they can be tested.
//
// Every route is served with X-Frame-Options: DENY and frame-ancestors 'none' (clickjacking), except the
// two public, read-only "embed" bubble pages, which a personal Apps Script page may frame. They carry no
// X-Frame-Options (a DENY there would still block the frame in some browsers). The popups keep the strict policy.
//
// Scope of the exception, stated exactly: frame-ancestors lists https://script.google.com and the wildcard
// https://*.googleusercontent.com, which covers EVERY https subdomain of googleusercontent.com, not only the
// Apps Script ones (the sandboxed iframe host of an Apps Script web app is an unstable subdomain, so exact
// origins cannot be pinned). Accepted by the owner on 2026-11-28 (request relayed by the private Finances
// project) because these pages are public, read-only, load no session or wallet provider (see
// components/Web3Provider.tsx), render no site chrome (lib/bare-routes.ts) and link nowhere.
//
// Next.js matches `source` case-insensitively and applies headers before resolving the route, so a case
// variant of an embed path (/CMC/crypto/bubbles/EMBED) gets the same headers and renders the 404 page: that page
// shows no link on these paths (app/not-found.tsx).

export const EMBED_PATHS = ["/cmc/crypto/bubbles/embed", "/cmc/stocks/bubbles/embed"];
export const EMBED_FRAME_ANCESTORS = ["https://script.google.com", "https://*.googleusercontent.com"];

// Next.js `source` pattern matching every path except the embed ones (path-to-regexp custom parameter).
const embedAlternatives = EMBED_PATHS.map((p) => p.slice(1)).join("|");
export const NOT_EMBED_SOURCE = `/:path((?!(?:${embedAlternatives})$).*)`;

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
function contentSecurityPolicy(frameAncestors) {
  return [
    `frame-ancestors ${frameAncestors}`, // clickjacking, the modern form of X-Frame-Options
    "base-uri 'self'",                   // blocks <base> injection redirecting relative URLs
    "form-action 'self'",                // blocks form-based exfiltration to another origin
    "object-src 'none'",                 // no plugin content
  ].join("; ");
}

function commonHeaders(frameAncestors) {
  return [
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Content-Security-Policy", value: contentSecurityPolicy(frameAncestors) },
    // Wallet extensions and WalletConnect rely on popups, so full same-origin
    // isolation is not an option here.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}

export function buildHeaders() {
  return [
    {
      source: NOT_EMBED_SOURCE,
      headers: [{ key: "X-Frame-Options", value: "DENY" }, ...commonHeaders("'none'")],
    },
    ...EMBED_PATHS.map((source) => ({
      source,
      headers: commonHeaders(EMBED_FRAME_ANCESTORS.join(" ")),
    })),
  ];
}

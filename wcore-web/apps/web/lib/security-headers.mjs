// Security headers of the web app, kept apart from next.config.mjs so they can be tested.
//
// Every route is served with X-Frame-Options: DENY and frame-ancestors 'none' (clickjacking), except the
// two public, read-only "embed" bubble pages, which a personal Apps Script page may frame. Their
// frame-ancestors is limited to Apps Script hosts; they carry no X-Frame-Options (a DENY there would
// still block the frame in some browsers). The popups keep the strict policy.

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

# Market Cap X Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and prepare a product-led X announcement for the new Market Cap Crypto and Market Cap Stock pages, then identify up to three safe community reply candidates without publishing any interaction.

**Architecture:** A focused Node.js build script captures both deployed product pages and embeds them into the established WCORE v12 SVG composition before exporting a matching PNG. Separate read-only and draft-preparation scripts keep discovery and composer automation isolated; a static Node test enforces dimensions, approved copy, typography rules, and the absence of publishing actions.

**Tech Stack:** Node.js 22, CommonJS, Playwright 1.59, SVG, Node test runner, Chrome CDP on port 9224, X web composer.

---

## File Map

- Create `wcore-web/scripts/x-cycle/market-cap-cycle.test.cjs`: static safety and contract tests for the three new scripts and generated assets.
- Create `wcore-web/scripts/build-post-market-cap.cjs`: capture production views, compose SVG, and export the 1200x675 PNG.
- Create `wcore-web/scripts/x-cycle/scan-market-cap.cjs`: read-only X search and candidate extraction.
- Create `wcore-web/scripts/x-cycle/prepare-post-market-cap.cjs`: open one clean composer and attach the approved copy and image without submitting.
- Create `wcore-web/apps/web/public/wcore-post-market-cap.svg`: generated source visual.
- Create `wcore-web/apps/web/public/wcore-post-market-cap.png`: generated post image.

### Task 1: Add The Static Safety Contract

**Files:**
- Create: `wcore-web/scripts/x-cycle/market-cap-cycle.test.cjs`
- Test: `wcore-web/scripts/x-cycle/market-cap-cycle.test.cjs`

- [ ] **Step 1: Write the failing static contract test**

Create a Node test that reads the future scripts as text and validates their public contract:

```js
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const ROOT = resolve(__dirname, "../..");
const read = (relative) => readFileSync(resolve(ROOT, relative), "utf8");

test("market cap post build keeps the approved product contract", () => {
  const source = read("scripts/build-post-market-cap.cjs");
  assert.match(source, /const W = 1200/);
  assert.match(source, /const H = 675/);
  assert.match(source, /Two markets\. One clean ranking\./);
  assert.match(source, /5,000 crypto assets/);
  assert.match(source, /5,000 public companies/);
  assert.match(source, /\/cmc\/crypto/);
  assert.match(source, /\/cmc\/stocks/);
});

test("market cap scan is read-only", () => {
  const source = read("scripts/x-cycle/scan-market-cap.cjs");
  assert.match(source, /READ-ONLY/);
  assert.doesNotMatch(source, /tweetButton|tweetButtonInline|data-testid=["']like|postReply/);
});

test("market cap draft uses approved copy and never submits", () => {
  const source = read("scripts/x-cycle/prepare-post-market-cap.cjs");
  assert.match(source, /Market Cap Crypto and Market Cap Stock are live\./);
  assert.match(source, /wcore-post-market-cap\.png/);
  assert.match(source, /FORBIDDEN/);
  assert.doesNotMatch(source, /tweetButton|tweetButtonInline|\.click\(.*Post/);
});

test("generated market cap assets are exactly 1200x675", () => {
  const svg = read("apps/web/public/wcore-post-market-cap.svg");
  const png = readFileSync(resolve(ROOT, "apps/web/public/wcore-post-market-cap.png"));
  assert.match(svg, /viewBox="0 0 1200 675"/);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 675);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `rtk node --test scripts/x-cycle/market-cap-cycle.test.cjs`

Expected: FAIL with `ENOENT` for `scripts/build-post-market-cap.cjs`.

- [ ] **Step 3: Commit the failing contract**

```powershell
rtk git add wcore-web/scripts/x-cycle/market-cap-cycle.test.cjs
rtk git commit -m "test: define market cap X cycle safety contract"
```

### Task 2: Build The Product Visual

**Files:**
- Create: `wcore-web/scripts/build-post-market-cap.cjs`
- Create: `wcore-web/apps/web/public/wcore-post-market-cap.svg`
- Create: `wcore-web/apps/web/public/wcore-post-market-cap.png`
- Test: `wcore-web/scripts/x-cycle/market-cap-cycle.test.cjs`

- [ ] **Step 1: Implement production page capture**

Use portable paths and Playwright. Capture only each page's `main` element after its title and table are visible:

```js
const { readFileSync, writeFileSync, unlinkSync } = require("node:fs");
const { resolve } = require("node:path");
const ROOT = resolve(__dirname, "..");
const PUBLIC = resolve(ROOT, "apps/web/public");
const W = 1200;
const H = 675;
const NAME = "wcore-post-market-cap";
const SITE = process.env.WCORE_SITE_URL || "https://wcore.xyz";

async function capture(page, route, title) {
  await page.goto(`${SITE}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.getByRole("heading", { name: title }).waitFor({ state: "visible", timeout: 30000 });
  await page.locator("main table").waitFor({ state: "visible", timeout: 30000 });
  return page.locator("main").screenshot({ type: "png" });
}
```

Launch Chromium at a fixed `1440x1000` viewport. Capture `/cmc/crypto` with `Market Cap Crypto` and `/cmc/stocks` with `Market Cap Stock`.

- [ ] **Step 2: Compose the SVG in the WCORE v12 language**

Build one 1200x675 SVG with these fixed regions:

```js
const cryptoData = `data:image/png;base64,${cryptoPng.toString("base64")}`;
const stockData = `data:image/png;base64,${stockPng.toString("base64")}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050607"/>
      <stop offset="0.55" stop-color="#081014"/>
      <stop offset="1" stop-color="#14220f"/>
    </linearGradient>
    <clipPath id="cryptoClip"><rect x="650" y="112" width="478" height="216" rx="24"/></clipPath>
    <clipPath id="stockClip"><rect x="650" y="347" width="478" height="216" rx="24"/></clipPath>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <text x="72" y="92" fill="#a3e635" font-size="18" font-weight="900">WCORE</text>
  <text x="72" y="195" fill="#f7f7f8" font-size="58" font-weight="950">Two markets.</text>
  <text x="72" y="258" fill="#f7f7f8" font-size="58" font-weight="950">One clean ranking.</text>
  <text x="72" y="347" fill="#a3e635" font-size="28" font-weight="900">5,000 crypto assets</text>
  <text x="72" y="397" fill="#f7f7f8" font-size="28" font-weight="900">5,000 public companies</text>
  <text x="72" y="492" fill="#a1a1aa" font-size="19" font-weight="700">Search. Compare. Stay informed.</text>
  <image href="${cryptoData}" x="650" y="112" width="478" height="216" preserveAspectRatio="xMidYMin slice" clip-path="url(#cryptoClip)"/>
  <image href="${stockData}" x="650" y="347" width="478" height="216" preserveAspectRatio="xMidYMin slice" clip-path="url(#stockClip)"/>
  <rect x="650" y="112" width="478" height="216" rx="24" fill="none" stroke="#84cc16" stroke-opacity="0.45"/>
  <rect x="650" y="347" width="478" height="216" rx="24" fill="none" stroke="#334155"/>
  <text x="1128" y="626" text-anchor="end" fill="#a3e635" font-size="28" font-weight="950">wcore.xyz</text>
</svg>`;
```

Use the exact official WCORE badge geometry from `wcore-web/scripts/build-post-one-clean-view.cjs` instead of the abbreviated text-only badge shown in the structural snippet.

- [ ] **Step 3: Export matching SVG and PNG**

Write the SVG, render it in a temporary local HTML page at device scale factor 1, take an exact 1200x675 screenshot, and remove the temporary HTML in `finally`.

- [ ] **Step 4: Generate the assets**

Run: `rtk node scripts/build-post-market-cap.cjs`

Expected: output reports both captures, an SVG path, a PNG path, and PNG dimensions `1200x675`.

- [ ] **Step 5: Verify visual and static contracts**

Run: `rtk node --test scripts/x-cycle/market-cap-cycle.test.cjs`

Expected: the build contract passes; scan and prepare tests still fail because those scripts do not exist.

Open `wcore-web/apps/web/public/wcore-post-market-cap.png` and verify both screenshots, all text, borders, and footer are fully visible.

- [ ] **Step 6: Commit the visual generator and assets**

```powershell
rtk git add wcore-web/scripts/build-post-market-cap.cjs wcore-web/apps/web/public/wcore-post-market-cap.svg wcore-web/apps/web/public/wcore-post-market-cap.png
rtk git commit -m "feat: create market cap X post visual"
```

### Task 3: Add And Run The Read-Only Community Scan

**Files:**
- Create: `wcore-web/scripts/x-cycle/scan-market-cap.cjs`
- Test: `wcore-web/scripts/x-cycle/market-cap-cycle.test.cjs`

- [ ] **Step 1: Implement a focused read-only scanner**

Follow `scan-live-clean.cjs`, keep CDP port 9224, and use these exact live-search queries:

```js
const QUERIES = [
  "compare crypto market cap stocks",
  "crypto market cap ranking tools",
  "track crypto and stocks one dashboard",
  "too many crypto research tools",
  "how to compare crypto projects by market cap",
];
```

For at most eight posts per query, print author, timestamp, status URL, text, and engagement metadata. Do not click or mutate any page state.

- [ ] **Step 2: Run the static contract**

Run: `rtk node --test scripts/x-cycle/market-cap-cycle.test.cjs`

Expected: read-only scan contract passes; only the missing draft script test remains red.

- [ ] **Step 3: Run the live scan**

Run: `rtk node scripts/x-cycle/scan-market-cap.cjs`

Expected: read-only output grouped under all five query headings. If CDP 9224 is unavailable, start the dedicated X Chrome profile before retrying.

- [ ] **Step 4: Verify candidate threads**

Pass potential URLs to the existing verifier:

```powershell
$env:X_TARGETS = ($acceptedUrls -join "|")
rtk node scripts/x-cycle/verify-targets.cjs
```

Reject hidden shills, stale posts, engagement bait, unrelated promotions, and any thread with an existing WCORE reply. Record zero to three accepted candidates with exact draft replies; do not invoke `post-replies.cjs`.

- [ ] **Step 5: Commit the scanner**

```powershell
rtk git add wcore-web/scripts/x-cycle/scan-market-cap.cjs
rtk git commit -m "feat: add read-only market cap X scan"
```

### Task 4: Prepare The Main X Draft Safely

**Files:**
- Create: `wcore-web/scripts/x-cycle/prepare-post-market-cap.cjs`
- Test: `wcore-web/scripts/x-cycle/market-cap-cycle.test.cjs`

- [ ] **Step 1: Implement the approved draft script**

Copy the clean-composer mechanics from `prepare-post-clean.cjs`, but use only these constants:

```js
const IMAGE = resolve(ROOT, "apps/web/public/wcore-post-market-cap.png");
const TEXT = [
  "Today's WCORE update.",
  "",
  "Market Cap Crypto and Market Cap Stock are live.",
  "",
  "Explore 5,000 crypto assets and 5,000 public companies with search, rankings, logos and clear data freshness.",
  "",
  "Two markets. One clean view.",
  "",
  "wcore.xyz",
];
```

Keep the existing `FORBIDDEN` checks for em dash, en dash, non-breaking space, and ellipsis. Navigate to a clean `/compose/post`, type with `keyboard.type`, attach exactly one image to the same composer, read back the complete draft, and print final text length plus attachment status. Do not locate or click any Post button.

- [ ] **Step 2: Run the full static safety contract**

Run: `rtk node --test scripts/x-cycle/market-cap-cycle.test.cjs`

Expected: `4` tests pass, `0` fail.

- [ ] **Step 3: Prepare the draft**

Run: `rtk node scripts/x-cycle/prepare-post-market-cap.cjs`

Expected: one clean composer, complete copy, one attached `wcore-post-market-cap.png`, and no submit action.

- [ ] **Step 4: Verify the actual composer manually**

Check that the first line is present, paragraph breaks match the approved copy, the attachment preview is the new Market Cap visual, and no stale attachment remains. Leave X open for user review and manual publication.

- [ ] **Step 5: Commit the draft preparer**

```powershell
rtk git add wcore-web/scripts/x-cycle/prepare-post-market-cap.cjs wcore-web/scripts/x-cycle/market-cap-cycle.test.cjs
rtk git commit -m "feat: prepare market cap X announcement draft"
```

### Task 5: Final Verification And Handoff

**Files:**
- Verify: all files listed in the file map

- [ ] **Step 1: Run code and asset checks**

```powershell
rtk node --test scripts/x-cycle/market-cap-cycle.test.cjs
rtk pnpm lint
rtk git diff --check
```

Expected: all static tests pass, lint exits 0, and diff check has no output.

- [ ] **Step 2: Confirm repository scope**

Run: `rtk git status --short`

Expected: only intended generated assets, scripts, test, and documentation changes are present. Never stage browser profiles, trace archives, screenshots outside the intended public assets, or credentials.

- [ ] **Step 3: Report the handoff**

Return:

- the prepared post copy;
- the generated image path;
- confirmation that the composer contains text plus one image and was not submitted;
- zero to three verified reply candidates with exact text;
- any rejected candidates and the concise rejection reason;
- test and lint evidence;
- the latest commit hashes.

Do not claim the post or any reply was published unless the user performs and confirms that action.

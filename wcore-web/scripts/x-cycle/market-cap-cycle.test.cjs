const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const ROOT = resolve(__dirname, "../..");

test("market cap visual uses the approved dimensions, copy, and routes", () => {
  const source = readFileSync(resolve(ROOT, "scripts/build-post-market-cap.cjs"), "utf8");

  assert.match(source, /const W = 1200/);
  assert.match(source, /const H = 675/);
  assert.match(source, /Two markets\. One clean ranking\./);
  assert.match(source, /5,000 crypto assets/);
  assert.match(source, /5,000 public companies/);
  assert.match(source, /\/cmc\/crypto/);
  assert.match(source, /\/cmc\/stocks/);
});

test("market cap scan remains read-only", () => {
  const source = readFileSync(resolve(ROOT, "scripts/x-cycle/scan-market-cap.cjs"), "utf8");

  assert.match(source, /READ-ONLY/);
  assert.doesNotMatch(source, /tweetButton|tweetButtonInline/);
  assert.doesNotMatch(source, /data-testid=["']like["']/);
  assert.doesNotMatch(source, /postReply/);
});

test("market cap post preparation is draft-only", () => {
  const source = readFileSync(resolve(ROOT, "scripts/x-cycle/prepare-post-market-cap.cjs"), "utf8");

  assert.match(source, /Market Cap Crypto and Market Cap Stock are live\./);
  assert.match(source, /wcore-post-market-cap\.png/);
  assert.match(source, /FORBIDDEN/);
  assert.doesNotMatch(source, /tweetButton|tweetButtonInline/);
  assert.doesNotMatch(source, /(?:postButton|submitButton)\s*\.click\s*\(/i);
  assert.doesNotMatch(source, /(?:getByText|getByRole|locator)\([^\n]*["']Post["'][^\n]*\)\.click\s*\(/);
});

test("generated market cap assets are 1200 by 675", () => {
  const svg = readFileSync(resolve(ROOT, "apps/web/public/wcore-post-market-cap.svg"), "utf8");
  const png = readFileSync(resolve(ROOT, "apps/web/public/wcore-post-market-cap.png"));

  assert.match(svg, /viewBox=["']0 0 1200 675["']/);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 675);
});

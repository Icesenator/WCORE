const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const ROOT = resolve(__dirname, "../..");

test("market cap visual uses the approved dimensions, copy, and routes", () => {
  const source = readFileSync(resolve(ROOT, "scripts/build-post-market-cap.cjs"), "utf8");

  assert.match(source, /const\s+W\s*=\s*1200\b/);
  assert.match(source, /const\s+H\s*=\s*675\b/);
  assert.match(source, /Two markets\. One clean ranking\./);
  assert.match(source, /5,000 crypto assets/);
  assert.match(source, /5,000 public companies/);
  assert.match(source, /\/cmc\/crypto/);
  assert.match(source, /\/cmc\/stocks/);
});

test("market cap scan remains read-only", () => {
  const source = readFileSync(resolve(ROOT, "scripts/x-cycle/scan-market-cap.cjs"), "utf8");

  assert.match(source, /READ-ONLY/);
  assert.doesNotMatch(source, /\.(?:click|fill|setInputFiles|dispatchEvent)\s*\(/);
  assert.doesNotMatch(source, /keyboard\s*\.\s*(?:type|press|insertText)\s*\(/);
  assert.doesNotMatch(source, /\b(?:like|retweet|follow|reply)(?:Button|Tweet|User|Post)?\b/i);
  assert.doesNotMatch(source, /tweetButton|tweetButtonInline|postReply/);
});

test("market cap post preparation is draft-only", () => {
  const source = readFileSync(resolve(ROOT, "scripts/x-cycle/prepare-post-market-cap.cjs"), "utf8");

  for (const line of [
    "Today's WCORE update.",
    "Market Cap Crypto and Market Cap Stock are live.",
    "Explore 5,000 crypto assets and 5,000 public companies with search, rankings, logos and clear data freshness.",
    "Two markets. One clean view.",
    "wcore.xyz",
  ]) {
    assert.ok(source.includes(line), `missing approved post line: ${line}`);
  }
  assert.match(source, /wcore-post-market-cap\.png/);
  assert.match(source, /FORBIDDEN/);
  assert.match(source, /\\u2014/);
  assert.match(source, /\\u2013/);
  assert.match(source, /\\u00A0/);
  assert.match(source, /\\\.\\\.\\\./);
  assert.match(source, /FORBIDDEN\s*\.\s*(?:filter|some)\s*\(/);
  assert.match(source, /issues\s*\.\s*length\s*>\s*0/);
  assert.doesNotMatch(source, /tweetButton|tweetButtonInline/);
  assert.doesNotMatch(source, /keyboard\s*\.\s*press\s*\(\s*["'](?:Control|Meta)\+Enter["']\s*\)/i);
  assert.doesNotMatch(source, /keyboard\s*\.\s*down\s*\(\s*["'](?:Control|Meta)["']\s*\)[\s\S]{0,200}keyboard\s*\.\s*press\s*\(\s*["']Enter["']/i);
  assert.doesNotMatch(source, /getBy(?:Role|Text)\s*\([^\n]*(?:button[^\n]*Post|Post[^\n]*button|["']Post["'])/i);
  assert.doesNotMatch(source, /\b(?:post|submit|tweet)Button\s*\.\s*click\s*\(/i);
  assert.doesNotMatch(source, /page\s*\.\s*click\s*\([^\n]*(?:Post|submit)/i);
  assert.doesNotMatch(source, /locator\s*\([^\n]*(?:Post|submit)[^\n]*\)\s*\.\s*click\s*\(/i);
  assert.doesNotMatch(source, /evaluate\s*\([\s\S]{0,500}\b(?:button|postButton|submitButton)\s*\.\s*click\s*\(/i);
});

test("generated market cap assets are 1200 by 675", () => {
  const svg = readFileSync(resolve(ROOT, "apps/web/public/wcore-post-market-cap.svg"), "utf8");
  const png = readFileSync(resolve(ROOT, "apps/web/public/wcore-post-market-cap.png"));

  assert.match(svg, /viewBox=["']0 0 1200 675["']/);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 675);
});

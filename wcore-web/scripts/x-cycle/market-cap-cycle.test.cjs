const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const ROOT = resolve(__dirname, "../..");

test("market cap visual uses the approved dimensions, copy, and routes", () => {
  const source = readFileSync(resolve(ROOT, "scripts/build-post-market-cap.cjs"), "utf8");

  assert.match(source, /const\s+W\s*=\s*1200\b/);
  assert.match(source, /const\s+H\s*=\s*675\b/);
  assert.match(source, /const\s+DISPLAY_ROWS\s*=\s*4\b/);
  assert.match(source, /Two markets\. One clean ranking\./);
  assert.match(source, /5,000 crypto assets/);
  assert.match(source, /5,000 public companies/);
  assert.match(source, /\/cmc\/crypto/);
  assert.match(source, /\/cmc\/stocks/);
  assert.doesNotMatch(source, /CRYPTO RANKING|STOCK RANKING/);
});

test("market cap scan remains read-only", () => {
  const source = readFileSync(resolve(ROOT, "scripts/x-cycle/scan-market-cap.cjs"), "utf8");

  assert.match(source, /READ-ONLY/);
  assert.doesNotMatch(source, /\.(?:click|dblclick|tap|fill|type|press|pressSequentially|insertText|down|up|focus|hover|dragTo|dragAndDrop|clear|check|uncheck|selectOption|setInputFiles|dispatchEvent)\s*\(/);
  assert.doesNotMatch(source, /\b(?:like|retweet|follow|reply)(?:Button|Tweet|User|Post)?\b/i);
  assert.doesNotMatch(source, /tweetButton|tweetButtonInline|postReply/);
});

test("market cap post preparation is draft-only", () => {
  const source = readFileSync(resolve(ROOT, "scripts/x-cycle/prepare-post-market-cap.cjs"), "utf8");

  assert.match(
    source,
    /const\s+TEXT\s*=\s*\[\s*["']Today's WCORE update\.["']\s*,\s*(?:""|'')\s*,\s*["']Market Cap Crypto and Market Cap Stock are live\.["']\s*,\s*(?:""|'')\s*,\s*["']Explore 5,000 crypto assets and 5,000 public companies with search, rankings, logos and clear data freshness\.["']\s*,\s*(?:""|'')\s*,\s*["']Two markets\. One clean view\.["']\s*,\s*(?:""|'')\s*,\s*["']wcore\.xyz["']\s*,?\s*\]\s*;/,
  );
  assert.match(source, /wcore-post-market-cap\.png/);
  assert.match(source, /FORBIDDEN/);
  assert.match(source, /\\u2014/);
  assert.match(source, /\\u2013/);
  assert.match(source, /\\u00A0/);
  assert.match(source, /\\\.\\\.\\\./);
  assert.match(source, /TEXT\s*\.\s*join\s*\(\s*["']\\n["']\s*\)/);
  assert.match(source, /const\s+issues\s*=\s*FORBIDDEN\s*\.\s*filter\s*\([\s\S]{0,200}\.re\s*\.\s*test\s*\(\s*joined\s*\)[\s\S]{0,100}\)\s*\.\s*map\s*\(/);
  assert.match(source, /if\s*\(\s*issues\s*\.\s*length\s*>\s*0\s*\)\s*\{[\s\S]{0,300}process\s*\.\s*exit\s*\(\s*1\s*\)/);
  assert.doesNotMatch(source, /tweetButton|tweetButtonInline/);
  assert.doesNotMatch(source, /\.click\s*\(/);
  assert.doesNotMatch(source, /keyboard\s*\.\s*press\s*\(\s*["'](?:(?:Control|Meta)\+)?Enter["'](?:\s*,[^)]*)?\s*\)/i);
  assert.doesNotMatch(source, /getByRole\s*\([\s\S]{0,160}["']button["'][\s\S]{0,160}\bPost\b/i);
  assert.doesNotMatch(source, /getByText\s*\([\s\S]{0,160}\bPost\b/i);
  assert.doesNotMatch(source, /(?:locator|filter)\s*\([\s\S]{0,200}\bPost\b[\s\S]{0,200}\)\s*\.\s*(?:click|press|dispatchEvent)\s*\(/i);
  assert.doesNotMatch(source, /button[\s\S]{0,120}\bsubmit\b[\s\S]{0,120}\.\s*(?:click|dblclick|tap|press|pressSequentially|dispatchEvent)\s*\(/i);
  assert.match(source, /\.setInputFiles\s*\(\s*IMAGE\s*\)/);
  assert.match(source, /const\s+finalState\s*=\s*await\s+page\s*\.\s*evaluate\s*\(/);
  assert.match(source, /if\s*\([^)]*(?:!\s*finalState\s*\.\s*textLen|finalState\s*\.\s*textLen\s*(?:===|<=)\s*0)/);
  assert.match(source, /if\s*\([^)]*!\s*finalState\s*\.\s*hasImage/);
});

test("generated market cap assets are 1200 by 675", () => {
  const svg = readFileSync(resolve(ROOT, "apps/web/public/wcore-post-market-cap.svg"), "utf8");
  const png = readFileSync(resolve(ROOT, "apps/web/public/wcore-post-market-cap.png"));

  assert.match(svg, /viewBox=["']0 0 1200 675["']/);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(png.readUInt32BE(8), 13);
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 675);
});

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const ROOT = resolve(__dirname, "../..");
const read = (relative) => readFileSync(resolve(ROOT, relative), "utf8");

test("prove your balance visual uses the approved contract", () => {
  const source = read("scripts/build-post-prove-your-balance.cjs");

  assert.match(source, /const W = 1200/);
  assert.match(source, /const H = 675/);
  assert.match(source, /Your balance is a claim\. Prove it\./);
  assert.match(source, /RPC CONSENSUS/);
  assert.match(source, /PRICE CASCADE/);
  assert.match(source, /STALE DATA GUARD/);
  assert.match(source, /READ ONLY/);
  assert.match(source, /VERIFIED/);
});

test("prove your balance post preparation is draft-only", () => {
  const source = read("scripts/x-cycle/prepare-post-prove-your-balance.cjs");

  assert.match(source, /Your balance is a claim\. Prove it\./);
  assert.match(source, /Public blockchain data can disagree across RPCs and price sources\./);
  assert.match(source, /wcore-post-prove-your-balance\.png/);
  assert.match(source, /FORBIDDEN/);
  assert.match(source, /setInputFiles\s*\(\s*IMAGE\s*\)/);
  assert.doesNotMatch(source, /tweetButton|tweetButtonInline/);
  assert.doesNotMatch(source, /\.click\s*\(/);
  assert.doesNotMatch(source, /keyboard\s*\.\s*press\s*\(\s*["'](?:(?:Control|Meta)\+)?Enter["']/i);
});

test("prove your balance cycle exports two technical replies", () => {
  const source = read("scripts/x-cycle/prove-your-balance-replies.cjs");
  const replies = require(resolve(ROOT, "scripts/x-cycle/prove-your-balance-replies.cjs"));

  assert.equal(replies.length, 2);
  assert.match(replies[0].text, /RPC endpoints can disagree/);
  assert.match(replies[0].text, /consensus/);
  assert.match(replies[1].text, /price cascade/);
  assert.match(replies[1].text, /stale/i);
  assert.doesNotMatch(source, /url\s*:/);
});

test("generated prove your balance assets are 1200 by 675", () => {
  const svg = read("apps/web/public/wcore-post-prove-your-balance.svg");
  const png = readFileSync(resolve(ROOT, "apps/web/public/wcore-post-prove-your-balance.png"));

  assert.match(svg, /viewBox=["']0 0 1200 675["']/);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 675);
});

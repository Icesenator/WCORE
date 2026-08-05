import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const WEB = process.cwd();

function source(path: string): string {
  return readFileSync(resolve(WEB, path), "utf8");
}

/**
 * How many chain configs the product actually ships.
 *
 * The copy used to pin a literal, and this test pinned the same literal, so when the
 * registry moved from 183 to 182 nothing complained: the public site kept advertising a
 * chain it no longer had. Reading the registry means the claim cannot drift again.
 */
function registryChainCount(): number {
  const dir = resolve(WEB, "../../../wcore-gsheet/dist/chains");
  return readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "index.ts").length;
}

test("public site copy advertises selected DeFi coverage without stale claims", () => {
  const home = source("app/page.tsx");
  const homeClient = source("app/HomePageClient.tsx");
  const about = source("app/about/page.tsx");
  const layout = source("app/layout.tsx");
  const footer = source("components/SidebarLayout.tsx");
  const welcome = source("components/WelcomeModal.tsx");
  const all = [home, homeClient, about, layout, footer, welcome].join("\n");

  assert.match(home, /Selected DeFi positions/);
  assert.match(homeClient, /Compound V3 collateral and debt/);
  assert.match(about, /Selected DeFi positions/);
  assert.match(about, /Coinbase, Kraken and OKX/);
  const chains = registryChainCount();
  assert.match(layout, new RegExp(`${chains} tracked chains`));
  assert.match(footer, new RegExp(`${chains} tracked chains.*Selected DeFi.*7 CEX.*80\\+ GM chains`, "s"));

  // No page may advertise a different count from the one the registry ships.
  for (const [name, text] of [["home", home], ["homeClient", homeClient], ["about", about], ["welcome", welcome]] as const) {
    const claims = [...text.matchAll(/(\d{2,4})\s+(?:tracked\s+)?chains/g)].map((m) => Number(m[1]));
    for (const claim of claims) {
      assert.equal(claim, chains, `${name} advertises ${claim} chains but the registry ships ${chains}`);
    }
  }
  assert.match(welcome, /Selected DeFi positions/);
  assert.doesNotMatch(all, /170\+ chains|183 live blockchains|8 dead chains|8 chains with 0 live RPCs|Dead-chain filter|Complex DeFi positions .* are not yet tracked|TON \(new\)|CEX \(new\)|Smart cache/);
});

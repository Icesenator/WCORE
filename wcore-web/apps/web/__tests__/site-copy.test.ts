import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WEB = process.cwd();

function source(path: string): string {
  return readFileSync(resolve(WEB, path), "utf8");
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
  assert.match(layout, /183 tracked chains/);
  assert.match(footer, /183 tracked chains.*Selected DeFi.*7 CEX.*80\+ GM chains/s);
  assert.match(welcome, /Selected DeFi positions/);
  assert.doesNotMatch(all, /170\+ chains|183 live blockchains|8 dead chains|Complex DeFi positions .* are not yet tracked|TON \(new\)|CEX \(new\)|Smart cache/);
});

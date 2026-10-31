import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/gm/GmPageClient.tsx", import.meta.url), "utf8");
const ACTIVE_GRID = '<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-8">';

// Index just past the </div> that closes the <div> opened at `start`.
function closingDivEnd(text: string, start: number): number {
  const tag = /<div\b[^>]*?(\/?)>|<\/div>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(text); m; m = tag.exec(text)) {
    if (m[0] === "</div>") depth--;
    else if (m[1] !== "/") depth++;
    if (depth === 0) return tag.lastIndex;
  }
  throw new Error("unbalanced <div> in GmPageClient.tsx");
}

const SECTION = '<section className="mt-8 w-full min-w-0">';

function historicalSection(): string {
  const heading = source.indexOf("Historical Chains (Retired)");
  assert.ok(heading > 0, "Historical Chains heading present");
  const open = source.indexOf(SECTION);
  assert.ok(open > 0 && open < heading, "Historical Chains rendered in its own full-width <section>");
  assert.equal(/<\/section>|<div\b/.test(source.slice(open + SECTION.length, heading)), false, "heading is the section's first child");
  return source.slice(open, source.indexOf("</section>", heading));
}

test("Historical Chains is a sibling below the authenticated active grid, never one of its cells", () => {
  // The authenticated grid is the one that renders GmChainCard.
  const grid = source.lastIndexOf(ACTIVE_GRID, source.indexOf("<GmChainCard"));
  assert.ok(grid > 0, "authenticated active grid present");
  const gridEnd = closingDivEnd(source, grid);
  const heading = source.indexOf("Historical Chains (Retired)");
  assert.ok(heading > gridEnd, "Historical Chains must start after the xl:grid-cols-8 grid is closed");
  assert.equal(source.slice(grid, gridEnd).includes("historicalContracts"), false);
});

test("Historical Chains has a full-width section and its own 1/2/3 column grid", () => {
  const section = historicalSection();
  assert.match(section, /className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"/);
  assert.equal(section.includes("xl:grid-cols-8"), false);
});

test("Historical Chains stays read-only and keeps its loading and empty states", () => {
  const section = historicalSection();
  assert.equal(/<button\b|GmWithdrawButton|handleSendGm|handleDeploy|onClick=/.test(section), false);
  assert.match(section, /Loading historical contracts…/);
  assert.match(section, /No historical contracts found\./);
  assert.match(section, /View on Explorer/);
  assert.match(section, /Retired chain — read-only/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("My Groups renders an accessible local-only panel without exploring during render", async () => {
  const mod = await import("../components/MyGroups").catch(() => null);
  assert.ok(mod, "MyGroups component exists");
  let navigations = 0;
  const html = renderToStaticMarkup(createElement(mod.MyGroups, { chains: ["BASE"], onExplore: () => { navigations++; } }));
  assert.match(html, /My Groups/);
  assert.match(html, /role="status"/);
  assert.match(html, /Local to this browser/);
  assert.match(html, /Explore group/);
  assert.match(html, /disabled/);
  assert.equal(navigations, 0);
});

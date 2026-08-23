import { describe, test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { sharePlugin, buildShareCardSvg } from "./share.js";

async function buildApp() {
  const app = Fastify();
  await sharePlugin(app);
  return app;
}

describe("share card endpoint", () => {
  test("renders a png for valid bucketed aggregates", async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: "GET", url: "/api/share/clean-total-card.png?total=12.4k&cur=eur&wallets=2_3&chains=21_50&cex=3" });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "image/png");
      const body = res.rawPayload ?? Buffer.alloc(0);
      assert.equal(body.subarray(1, 4).toString("ascii"), "PNG");
      assert.ok(body.length > 1000);
    } finally {
      await app.close();
    }
  });

  test("rejects raw or oversized totals and unknown buckets", async () => {
    const app = await buildApp();
    try {
      for (const query of [
        "total=12345.678901234567&wallets=1&chains=1_5&cex=0",
        "total=-5k&wallets=1&chains=1_5&cex=0",
        "total=12k&cur=btc&wallets=1&chains=1_5&cex=0",
        "total=12k&wallets=7&chains=21_50&cex=0",
        "total=12k&wallets=1&chains=all&cex=0",
        "total=12k&wallets=1&chains=1_5&cex=99",
        "total=12k&wallets=1&chains=1_5&cex=0&address=0xabc",
      ]) {
        const res = await app.inject({ method: "GET", url: `/api/share/clean-total-card.png?${query}` });
        assert.equal(res.statusCode, 400, `expected 400 for ${query}`);
        assert.match(res.body as string, /invalid_query/);
      }
    } finally {
      await app.close();
    }
  });

  test("svg contains only rounded aggregates and a clean cta, never free-form input", () => {
    const svg = buildShareCardSvg({ total: "12.4k", cur: "usd", wallets: "4_plus", chains: "51_plus", cex: 7 });
    assert.match(svg, /\$12\.4k/);
    assert.match(svg, /4\+ wallets/);
    assert.match(svg, /51\+ chains/);
    assert.match(svg, /7 CEX/);
    assert.match(svg, /Scam tokens flagged/);
    assert.match(svg, />wcore\.xyz<\/text>/);
    assert.doesNotMatch(svg, /campaign/);
    assert.doesNotMatch(svg, /address|0x[0-9a-fA-F]{6,}/);
  });

  test("svg escapes xml-sensitive characters in the total", () => {
    const svg = buildShareCardSvg({ total: '12<4>&"k', cur: "usd", wallets: "1", chains: "1_5", cex: 0 });
    assert.doesNotMatch(svg, /12<4>/);
    assert.match(svg, /12&lt;4&gt;&amp;&quot;k/);
  });
});

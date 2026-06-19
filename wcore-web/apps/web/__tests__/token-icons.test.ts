import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getTokenIconSource, getTokenLogoUrl, TokenIcon } from "../components/TokenIcon";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("token icons", () => {
  test("uses stable Optimism token logo for OP", () => {
    assert.equal(
      getTokenLogoUrl("OP"),
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/assets/0x4200000000000000000000000000000000000042/logo.png",
    );
  });

  test("uses verified logo overrides for long-tail native tokens", () => {
    assert.equal(getTokenLogoUrl("MITO"), "https://coin-images.coingecko.com/coins/images/68355/large/mitosis.png");
    assert.equal(getTokenLogoUrl("HYPE"), "https://s2.coinmarketcap.com/static/img/coins/64x64/32196.png");
    assert.equal(getTokenLogoUrl("OKB"), "https://s2.coinmarketcap.com/static/img/coins/64x64/3897.png");
    assert.equal(getTokenLogoUrl("METIS"), "https://icons.llamao.fi/icons/chains/rsz_metis.jpg");
    assert.equal(getTokenLogoUrl("FLR"), "https://icons.llamao.fi/icons/chains/rsz_flare.jpg");
    assert.equal(getTokenLogoUrl("ASTR"), "https://icons.llamao.fi/icons/chains/rsz_astar.jpg");
    assert.equal(getTokenLogoUrl("OPEN"), "https://coin-images.coingecko.com/coins/images/67482/large/open.png");
    assert.equal(getTokenLogoUrl("BTCN"), "https://coin-images.coingecko.com/coins/images/53914/large/bitcorn_logo_200.png");
    assert.equal(getTokenLogoUrl("PLUME"), "https://icons.llamao.fi/icons/chains/rsz_plume.jpg");
    assert.equal(getTokenLogoUrl("KAIA"), "https://icons.llamao.fi/icons/chains/rsz_kaia.jpg");
    assert.equal(getTokenLogoUrl("BERA"), "https://icons.llamao.fi/icons/chains/rsz_berachain.jpg");
    assert.equal(getTokenLogoUrl("VANA"), "https://icons.llamao.fi/icons/chains/rsz_vana.jpg");
    assert.equal(getTokenLogoUrl("GHO"), "https://coin-images.coingecko.com/coins/images/30663/large/gho-token-logo.png");
    assert.equal(getTokenLogoUrl("G"), "https://coin-images.coingecko.com/coins/images/39200/large/gravity.jpg");
  });

  test("renders a text fallback behind CDN token logos", () => {
    const markup = renderToStaticMarkup(React.createElement(TokenIcon, { symbol: "ZZZZ" }));

    assert.match(markup, />ZZZ</);
    assert.match(markup, /zzzz\.svg/);
  });

  test("logo image uses object-contain so transparent stock favicons are not cropped", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TokenIcon, { symbol: "AAPL", logoUrl: "https://icons.duckduckgo.com/ip3/apple.com.ico" }),
    );
    assert.match(markup, /object-contain/);
    assert.doesNotMatch(markup, /object-cover/);
    assert.match(markup, /apple\.com\.ico/);
  });

  test("resolves missing third fallback without render-time state mutation", () => {
    assert.equal(getTokenIconSource("ZZZZ", undefined, 2), null);
  });

  test("resolves SOMI/MON token logo via llamao override (not the 404 spothq path)", () => {
    assert.equal(getTokenLogoUrl("SOMI"), "https://icons.llamao.fi/icons/chains/rsz_somnia.jpg");
    assert.equal(getTokenLogoUrl("MON"), "https://icons.llamao.fi/icons/chains/rsz_monad.jpg");
  });

  test("CMC fallback uses verified UCID for SOMI/MON", () => {
    assert.equal(getTokenIconSource("SOMI", undefined, 2), "https://s2.coinmarketcap.com/static/img/coins/64x64/37637.png");
    assert.equal(getTokenIconSource("MON", undefined, 2), "https://s2.coinmarketcap.com/static/img/coins/64x64/30495.png");
  });
});

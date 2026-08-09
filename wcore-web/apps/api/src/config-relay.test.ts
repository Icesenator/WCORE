import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveRelayBaseUrl, resolveRelayToken } from "./config.js";

describe("relay token resolution", () => {
  test("returns the configured token", () => {
    assert.equal(resolveRelayToken({ RELAY_TOKEN: "secret" }), "secret");
  });

  // `!token` laissait passer une valeur faite d'espaces, qui partait ensuite au
  // relais et revenait 401.
  test("treats an absent or blank token as unconfigured", () => {
    assert.equal(resolveRelayToken({}), "");
    assert.equal(resolveRelayToken({ RELAY_TOKEN: "   " }), "");
  });
});

describe("relay base URL resolution", () => {
  test("prefers the provider-specific variable", () => {
    const env = { BYBIT_RELAY_URL: "https://bybit.example", CEX_RELAY_URL: "https://shared.example" };
    assert.equal(resolveRelayBaseUrl(env, "bybit"), "https://bybit.example");
    assert.equal(resolveRelayBaseUrl(env, "binance"), "https://shared.example");
  });

  // Defaut A: cex.ts:56 ne lisait jamais STOCK_RELAY_URL. Un operateur pointant
  // les actions vers un relais dedie etait silencieusement ignore sur ce chemin,
  // alors que stock-service.ts, lui, l'honorait.
  test("honours STOCK_RELAY_URL for the stock target", () => {
    const env = { STOCK_RELAY_URL: "https://stocks.example", CEX_RELAY_URL: "https://shared.example" };
    assert.equal(resolveRelayBaseUrl(env, "stock"), "https://stocks.example");
  });

  // Defaut B: les variables RAILWAY_SERVICE_*_URL sont des hostnames nus.
  // stock-service.ts:335 les mettait brutes dans la chaine ||, produisant une
  // valeur qui n'est pas une URL.
  test("gives the bare Railway hostname a scheme", () => {
    assert.equal(
      resolveRelayBaseUrl({ RAILWAY_SERVICE_CEX_RELAY_URL: "cex-relay.up.railway.app" }, "stock"),
      "https://cex-relay.up.railway.app",
    );
    assert.equal(
      resolveRelayBaseUrl({ RAILWAY_SERVICE_BINANCE_RELAY_URL: "https://binance-relay.up.railway.app" }, "binance"),
      "https://binance-relay.up.railway.app",
    );
  });

  // Defaut C: sans normalisation, un CEX_RELAY_URL termine par / produit //path.
  test("strips trailing slashes on every target", () => {
    const env = { CEX_RELAY_URL: "https://shared.example///" };
    assert.equal(resolveRelayBaseUrl(env, "okx"), "https://shared.example");
    assert.equal(resolveRelayBaseUrl(env, "stock"), "https://shared.example");
  });

  // Defaut D: cex.ts essayait BINANCE puis BYBIT, stock-service.ts l'inverse.
  test("uses one precedence order for every target", () => {
    const env = { BINANCE_RELAY_URL: "https://binance.example", BYBIT_RELAY_URL: "https://bybit.example" };
    assert.equal(resolveRelayBaseUrl(env, "coinbase"), "https://binance.example");
    assert.equal(resolveRelayBaseUrl(env, "stock"), "https://binance.example");
  });

  test("explicit variables win over the Railway fallback", () => {
    const env = { CEX_RELAY_URL: "https://shared.example", RAILWAY_SERVICE_CEX_RELAY_URL: "relay.up.railway.app" };
    assert.equal(resolveRelayBaseUrl(env, "binance"), "https://shared.example");
  });

  test("returns an empty string when nothing is configured", () => {
    assert.equal(resolveRelayBaseUrl({}, "stock"), "");
    assert.equal(resolveRelayBaseUrl({}, "binance"), "");
  });

  test("ignores blank values instead of accepting them as configured", () => {
    const env = { CEX_RELAY_URL: "   ", BINANCE_RELAY_URL: "https://binance.example" };
    assert.equal(resolveRelayBaseUrl(env, "binance"), "https://binance.example");
  });
});

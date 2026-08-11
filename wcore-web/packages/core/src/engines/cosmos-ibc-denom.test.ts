import { test } from "node:test";
import assert from "node:assert/strict";
import { getCosmosWalletAssets } from "./cosmos.js";
import { MemoryCacheStore } from "../cache/index.js";
import { MemoryPricingCache, type PricingSourceSet } from "../pricing/index.js";

const ADDRESS = "cosmos1nvfsmt48nemfullrkkxa6gze05c4xeypfslj7t";
const IBC_DENOM = "ibc/0025F8A87464A471E66B234C4F93AEC5B4DA3D42D7986451A059273426290DD5";
const HASH = IBC_DENOM.slice(4);

const NEW_ROUTE = `/ibc/apps/transfer/v1/denoms/${HASH}`;
const LEGACY_ROUTE = `/ibc/apps/transfer/v1/denom_traces/${HASH}`;

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/**
 * Serves the wallet with a single IBC balance and lets each test decide how the two
 * denom lookup routes behave.
 */
function makeFetch(routes: { newRoute?: () => Response; legacy?: () => Response }) {
  const seen: string[] = [];
  const fetchImpl = (async (url: string) => {
    const u = String(url);
    seen.push(u);
    if (u.includes("/cosmos/bank/v1beta1/balances/")) {
      return json({ balances: [{ denom: IBC_DENOM, amount: "1000000" }] });
    }
    if (u.includes(NEW_ROUTE)) {
      return routes.newRoute ? routes.newRoute() : json({}, 501);
    }
    if (u.includes(LEGACY_ROUTE)) {
      return routes.legacy ? routes.legacy() : json({}, 404);
    }
    // Staking, rewards, unbonding and anything else: empty but successful.
    return json({});
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

async function scan(routes: Parameters<typeof makeFetch>[0], sources?: PricingSourceSet) {
  const { fetchImpl, seen } = makeFetch(routes);
  const assets = await getCosmosWalletAssets(ADDRESS, "COSMOS_HUB", { fetchImpl, fxRate: 1, sources, sharedPriceCache: new MemoryPricingCache() });
  return { assets, seen };
}

test("an IBC denom resolves through the current denoms route", async () => {
  // Cosmos Hub runs IBC-Go v10: the retired route answers 501 there.
  const { assets } = await scan({
    newRoute: () => json({ denom: { base: "untrn", trace: [{ port_id: "transfer", channel_id: "channel-569" }] } }),
  });

  const token = assets.tokens.find((t) => t.denom === IBC_DENOM);
  assert.ok(token, "the IBC token must be reported");
  assert.equal(token.decimals, 6, "untrn is a micro-denom, so 6 decimals");
  assert.equal(token.balance, 1, "1000000 untrn is 1 NTRN");
  assert.equal(token.symbol, "NTRN");
});

test("an IBC token uses its origin chain price mapping", async () => {
  const requestedIds: Array<string | undefined> = [];
  const sources: PricingSourceSet = {
    defillama: { getNativePriceUsd: async () => null, getTokenPriceUsd: async () => null },
    dexscreener: { getTokenPriceUsd: async () => null },
    geckoterminal: { getTokenPriceUsd: async () => null },
    coingecko: {
      getNativePriceUsd: async () => null,
      getTokenPriceUsd: async (_token, geckoId) => {
        requestedIds.push(geckoId);
        return geckoId === "neutron-3" ? 0.5 : null;
      },
    },
    jupiter: { getTokenPriceUsd: async () => null },
    onchainV3: { getTokenPriceUsd: async () => null },
  };

  const { assets } = await scan({
    newRoute: () => json({ denom: { base: "untrn", trace: [] } }),
  }, sources);

  const token = assets.tokens.find((t) => t.denom === IBC_DENOM);
  assert.ok(token);
  assert.equal(token.symbol, "NTRN");
  assert.equal(token.priceEur, 0.5);
  assert.ok(requestedIds.includes("neutron-3"));
});

test("an IBC stablecoin uses the resolved symbol and peg price", async () => {
  const { assets } = await scan({
    newRoute: () => json({ denom: { base: "uusdc", trace: [] } }),
  });

  const token = assets.tokens.find((t) => t.denom === IBC_DENOM);
  assert.ok(token);
  assert.equal(token.symbol, "USDC");
  assert.equal(token.priceEur, 1);
  assert.equal(token.valueEur, 1);
});

test("an IBC denom still resolves on chains that only expose denom_traces", async () => {
  // Injective and Terra answer 501 on the new route; querying only it left every IBC
  // token on those chains unpriced.
  const { assets, seen } = await scan({
    newRoute: () => json({}, 501),
    legacy: () => json({ denom_trace: { path: "transfer/channel-1", base_denom: "uosmo" } }),
  });

  assert.ok(seen.some((u) => u.includes(LEGACY_ROUTE)), "the legacy route must be tried after a 501");
  const token = assets.tokens.find((t) => t.denom === IBC_DENOM);
  assert.ok(token, "the IBC token must be reported");
  assert.equal(token.decimals, 6);
});

test("an unresolvable IBC denom is reported, never guessed", async () => {
  const { assets } = await scan({
    newRoute: () => json({}, 501),
    legacy: () => json({}, 404),
  });

  const token = assets.tokens.find((t) => t.denom === IBC_DENOM);
  assert.equal(token, undefined, "a denom of unknown scale must not be valued");
  assert.ok(
    assets.errors.some((e) => e.includes("decimals_unknown")),
    "the caller must see why the token was skipped",
  );
});

test("a base denom of unknown scale is not assumed to be six decimals", async () => {
  // factory/, erc20/ and cw20: denoms carry no scale convention; guessing 6 can be
  // twelve orders of magnitude off.
  const { assets } = await scan({
    newRoute: () => json({ denom: { base: "factory/neutron1abc/astro" } }),
  });

  const token = assets.tokens.find((t) => t.denom === IBC_DENOM);
  assert.equal(token, undefined, "a non micro-denom base must stay unvalued");
  assert.ok(assets.errors.some((e) => e.includes("factory/neutron1abc/astro")));
});

test("a liquid-staking derivative inherits the scale of the denomination it wraps", async () => {
  const { assets } = await scan({
    newRoute: () => json({ denom: { base: "stuatom" } }),
  });

  const token = assets.tokens.find((t) => t.denom === IBC_DENOM);
  assert.ok(token, "stuatom wraps uatom and shares its scale");
  assert.equal(token.decimals, 6);
});

test("an atto-scaled derivative is not read as a micro denomination", async () => {
  // staevmos wraps aevmos, which is 18. Treating every st denomination as 6 would be
  // twelve orders of magnitude off.
  const { assets } = await scan({
    newRoute: () => json({ denom: { base: "staevmos" } }),
  });

  const token = assets.tokens.find((t) => t.denom === IBC_DENOM);
  assert.equal(token, undefined, "an unproven scale must never be assumed");
  assert.ok(assets.errors.some((e) => e.includes("staevmos")));
});
test("a resolved IBC denomination is not looked up again on the next scan", async () => {
  const cache = new MemoryCacheStore();
  let lookups = 0;
  const routes = {
    newRoute: () => { lookups++; return json({ denom: { base: "untrn" } }); },
  };

  const first = await (async () => {
    const { fetchImpl } = makeFetch(routes);
    return getCosmosWalletAssets(ADDRESS, "COSMOS_HUB", { fetchImpl, fxRate: 1, cache });
  })();
  assert.ok(first.tokens.find((t) => t.denom === IBC_DENOM), "precondition: resolved once");
  assert.equal(lookups, 1);
  await new Promise((r) => setTimeout(r, 300)); // the cache write is fire-and-forget

  const { fetchImpl } = makeFetch(routes);
  const second = await getCosmosWalletAssets(ADDRESS, "COSMOS_HUB", { fetchImpl, fxRate: 1, cache });

  // A hash is the digest of its trace, so re-resolving it made every scan depend on that
  // endpoint answering right then, for a mapping that cannot change.
  assert.equal(lookups, 1, "the second scan must reuse the cached denomination");
  const token = second.tokens.find((t) => t.denom === IBC_DENOM);
  assert.ok(token, "the token must still be reported from cache");
  assert.equal(token.decimals, 6);
});
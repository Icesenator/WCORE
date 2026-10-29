import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GM_WIND_DOWN, getGmWindDown, isGmDeployBlocked, gmDeployBlockedMessage } from "../lib/gm-winddown";
import { getFactoryAddress } from "@wcore/shared";

describe("GM winding-down chains", () => {
  test("NEG: a new GM contract is blocked on Abstract", () => {
    assert.equal(isGmDeployBlocked("abstract"), true);
    assert.equal(isGmDeployBlocked("ABSTRACT"), true, "lookup must be case-insensitive");
    assert.equal(isGmDeployBlocked(" abstract "), true, "lookup must trim");
  });

  test("POS: chains that are not winding down are unaffected", () => {
    for (const key of ["base", "moca", "ink", "worldchain"]) {
      assert.equal(isGmDeployBlocked(key), false, `${key} must not be blocked`);
      assert.equal(getGmWindDown(key), undefined);
    }
    assert.equal(isGmDeployBlocked(undefined), false);
    assert.equal(isGmDeployBlocked(""), false);
    assert.equal(isGmDeployBlocked(null), false);
  });

  test("the refusal message carries the date and never promises migration or recovery", () => {
    const wd = GM_WIND_DOWN.abstract;
    const msg = gmDeployBlockedMessage(wd);
    assert.ok(msg.includes("2026-12-15"), "must state the announced shutdown date");
    assert.ok(/does not migrate/i.test(msg), "must state that WCORE does not migrate assets");
    assert.ok(!/\bwe (will )?(migrate|recover|refund)\b/i.test(msg), "must not promise recovery");
    assert.ok(/DM/i.test(msg), "must warn against DM solicitation");
  });

  test("official resources are the announced Abstract endpoints only", () => {
    const wd = GM_WIND_DOWN.abstract;
    assert.deepEqual(wd.officialResources, ["https://migrate.abs.xyz", "https://native-bridge.abs.xyz"]);
  });

  test("blocking new deploys must NOT remove the factory: historical access stays intact", () => {
    // The block is deliberately narrower than retirement. Abstract keeps its factory so
    // existing contracts stay identifiable and balances stay visible while users migrate.
    assert.equal(isGmDeployBlocked("abstract"), true);
    assert.ok(getFactoryAddress("abstract"), "Abstract factory must remain registered");
    assert.equal(getGmWindDown("degen"), undefined, "retired chains are handled by GM_HISTORICAL_FACTORIES, not here");
  });

  test("every entry keeps an ISO shutdown date", () => {
    for (const [key, wd] of Object.entries(GM_WIND_DOWN)) {
      assert.equal(wd.chainKey, key);
      assert.match(wd.announcedShutdown, /^\d{4}-\d{2}-\d{2}$/, `${key} needs an ISO date`);
    }
  });

  test("WIRING: every GM deploy surface consults the winding-down guard", () => {
    // Guards against a future surface being added (or an existing one losing the check)
    // without consulting gm-winddown.ts. Read-only source assertion, no runtime.
    const surfaces: Array<[string, RegExp]> = [
      ["../hooks/useOnChainGm.ts", /gm-winddown/],
      ["../components/ChainCard.tsx", /getGmWindDown|gmDeployBlockedMessage/],
      ["../app/dev/deploy/DeployClient.tsx", /getGmWindDown/],
    ];
    for (const [rel, pattern] of surfaces) {
      const src = readFileSync(new URL(rel, import.meta.url), "utf8");
      assert.match(src, pattern, `${rel} must consult the winding-down guard`);
    }
  });

  test("BYPASS CHECK: the API deploy route only records verified on-chain deploys", () => {
    // POST /api/gm/contracts/deploy verifies factory logs and persists; it never signs or
    // sends a transaction, so it cannot initiate a NEW deployment by itself.
    const src = readFileSync(new URL("../../api/src/gamification/gm-contracts.ts", import.meta.url), "utf8");
    assert.match(src, /deploy_verification_failed/, "must reject unverified deploys");
    assert.ok(!/writeContract|sendTransaction|signTransaction/.test(src), "must not sign or send transactions");
  });
});

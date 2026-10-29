import { describe, expect, test } from "vitest";
import { getFactory, GM_FACTORIES, GM_HISTORICAL_FACTORIES } from "./factories";

describe("GM_FACTORIES", () => {
  test("excludes retired Lisk from GM eligibility", () => {
    expect(getFactory("lisk")).toBeUndefined();
    expect(getFactory("LISK")).toBeUndefined();
  });
  test("registers the Moca factory attested on-chain on chain 2288", () => {
    // Factory produced by the operator through /dev/deploy ("Deployment Complete"),
    // then verified read-only on Moca 2288: eth_chainId 0x8f0, eth_getCode non-empty,
    // platformOwner() = GM_PLATFORM_OWNER, implementation() = 0x4d90…2960 (code present),
    // creation receipt status=1 with to=null. Config only — no transaction here.
    expect(getFactory("moca")).toEqual({
      address: "0xef4e94691589224a92e26741e098a3cbcd63d169",
      chainId: 2288,
    });
    expect(getFactory("MOCA")).toEqual({
      address: "0xef4e94691589224a92e26741e098a3cbcd63d169",
      chainId: 2288,
    });
  });
  test("includes newly deployed GM factory chains", () => {
    expect(getFactory("intuition")).toEqual({
      address: "0xb6a0615caf1fc1d27688f77de251411776404110",
      chainId: 1155,
    });
    expect(getFactory("plume")).toEqual({
      address: "0xc019e086f795661213b11884b52338e8752468d3",
      chainId: 98866,
    });
    expect(getFactory("superposition")).toBeUndefined();
    expect(getFactory("DEGEN")).toBeUndefined();
    expect(getFactory("monad")).toEqual({
      address: "0xd4930a277986021da6db82db18fd26e6c6c4a763",
      chainId: 143,
    });
    expect(getFactory("megaeth")).toEqual({
      address: "0xc357a4e3741e57a9bf53a3ae1c7584e16413dd07",
      chainId: 4326,
    });
    expect(getFactory("doma")).toEqual({
      address: "0x405376616102772a6045b5ad61f877fb31bafb93",
      chainId: 97477,
    });
    expect(getFactory("b2")).toEqual({
      address: "0x4a36400e6717d4201e22baf66832f06d8ad54bb1",
      chainId: 223,
    });
    expect(getFactory("katana")).toEqual({
      address: "0x79113a6c0517a2e748b87bab6e4058ad75eb4352",
      chainId: 747474,
    });
  });

  test("historical factories kept separately for retired chains Degen and Superposition", () => {
    // Retired chains are absent from the active registry — no new GM is possible.
    expect(getFactory("degen")).toBeUndefined();
    expect(getFactory("superposition")).toBeUndefined();
    expect(getFactory("DEGEN")).toBeUndefined();
    expect(getFactory("SUPERPOSITION")).toBeUndefined();
    expect(Object.keys(GM_FACTORIES)).not.toContain("degen");
    expect(Object.keys(GM_FACTORIES)).not.toContain("superposition");

    // Their factories survive in the historical registry so old contracts stay identifiable.
    expect(GM_HISTORICAL_FACTORIES.degen).toEqual({
      address: "0xc3e5ef8c71712f55fabc6b3c07844a49103c9d8f",
      chainId: 666666666,
    });
    expect(GM_HISTORICAL_FACTORIES.superposition).toEqual({
      address: "0x8e2530ef73ef47a1f086f8baf423c1bdcd9e472f",
      chainId: 55244,
    });
    // No retirement date is recorded (not attested per chain).
    for (const entry of Object.values(GM_HISTORICAL_FACTORIES)) {
      expect(Object.keys(entry).sort()).toEqual(["address", "chainId"]);
    }

    // An active chain is never historical.
    expect(Object.keys(GM_HISTORICAL_FACTORIES)).not.toContain("moca");
    expect(Object.keys(GM_HISTORICAL_FACTORIES)).not.toContain("base");
  });
});

import { describe, expect, test } from "vitest";
import { getFactory } from "./factories";

describe("GM_FACTORIES", () => {
  test("includes newly deployed GM factory chains", () => {
    expect(getFactory("intuition")).toEqual({
      address: "0xb6a0615caf1fc1d27688f77de251411776404110",
      chainId: 1155,
    });
    expect(getFactory("plume")).toEqual({
      address: "0xc019e086f795661213b11884b52338e8752468d3",
      chainId: 98866,
    });
    expect(getFactory("superposition")).toEqual({
      address: "0x8e2530ef73ef47a1f086f8baf423c1bdcd9e472f",
      chainId: 55244,
    });
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
});

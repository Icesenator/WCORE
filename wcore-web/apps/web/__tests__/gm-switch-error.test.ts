import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { describeGmSwitchError, getWalletErrorCode, getWalletErrorMessage } from "../lib/gm-switch-error";

describe("getWalletErrorCode", () => {
  test("reads numeric, string and nested codes", () => {
    assert.equal(getWalletErrorCode({ code: 4902 }), 4902);
    assert.equal(getWalletErrorCode({ code: "4902" }), 4902);
    assert.equal(getWalletErrorCode({ data: { originalError: { code: "4001" } } }), 4001);
    assert.equal(getWalletErrorCode({ code: -32603, data: { originalError: { code: 4902 } } }), -32603);
    assert.equal(getWalletErrorCode(new Error("no code")), undefined);
    assert.equal(getWalletErrorCode(null), undefined);
  });
});

describe("getWalletErrorMessage", () => {
  test("prefers Error.message then a nested wallet message", () => {
    assert.equal(getWalletErrorMessage(new Error("boom")), "boom");
    assert.equal(
      getWalletErrorMessage({ data: { originalError: { message: "inner detail" } } }),
      "inner detail",
    );
    assert.equal(getWalletErrorMessage({ code: 4001 }), "");
  });
});

describe("describeGmSwitchError", () => {
  test("names the chain and keeps an unknown wallet error code", () => {
    const msg = describeGmSwitchError("SWAN", Object.assign(new Error("boom"), { code: -32000 }));
    assert.match(msg, /Could not switch to SWAN/);
    assert.match(msg, /wallet error -32000/);
  });

  test("turns a user rejection (4001) into an explicit message", () => {
    const msg = describeGmSwitchError(
      "SWAN",
      Object.assign(new Error("User rejected the request."), { code: 4001 }),
    );
    assert.equal(msg, "You rejected the switch to SWAN in your wallet.");
  });

  test("explains a pending wallet request (-32002)", () => {
    const msg = describeGmSwitchError("Base", Object.assign(new Error("already pending"), { code: -32002 }));
    assert.match(msg, /pending request/i);
  });

  test("explains an unknown chain (4902)", () => {
    const msg = describeGmSwitchError(
      "Swan",
      Object.assign(new Error("Unrecognized chain ID"), { code: 4902 }),
    );
    assert.match(msg, /does not know Swan/);
  });

  test("does not disguise a lost provider as a chain-switch problem", () => {
    const msg = describeGmSwitchError("SWAN", new Error("No wallet provider available"));
    assert.match(msg, /no longer connected to WCORE/);
    assert.doesNotMatch(msg, /Could not switch/);
  });

  test("falls back to the wallet message when no code is present", () => {
    assert.equal(
      describeGmSwitchError("SWAN", new Error("some wallet detail")),
      "Could not switch to SWAN: some wallet detail",
    );
  });

  test("keeps the generic fallback when there is nothing to report", () => {
    assert.equal(
      describeGmSwitchError("SWAN", {}),
      "Could not switch to SWAN. Check your wallet and try again.",
    );
  });
});

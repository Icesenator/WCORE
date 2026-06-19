import test from "node:test";
import assert from "node:assert/strict";
import { classifyWalletSignError, walletErrorLabel } from "../lib/wallet-errors";

test("classifyWalletSignError only reports signature_refused for explicit user rejection", () => {
  assert.equal(classifyWalletSignError({ code: 4001, message: "User rejected the request" }), "signature_refused");
  assert.equal(classifyWalletSignError({ name: "ConnectorNotConnectedError", message: "Connector not connected" }), "wallet_not_connected");
  assert.equal(classifyWalletSignError({ code: -32002, message: "Resource unavailable: request already pending" }), "wallet_request_pending");
  assert.equal(classifyWalletSignError(new Error("No provider found on window.ethereum")), "wallet_provider_missing");
  assert.equal(classifyWalletSignError(new Error("Internal connector error")), "signature_failed");
});

test("walletErrorLabel gives a specific message for non-rejection signature failures", () => {
  assert.match(walletErrorLabel("signature_failed"), /Could not open/);
  assert.match(walletErrorLabel("wallet_not_connected"), /Reconnect/);
  assert.equal(walletErrorLabel("signature_refused"), "Signature rejected.");
});

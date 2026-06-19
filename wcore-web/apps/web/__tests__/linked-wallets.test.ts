// Run: node --import tsx --test apps/web/__tests__/linked-wallets.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getLinkedWalletStatus } from "../app/profile/components/LinkedWallets";

test("linked wallet status renders Signed only for server-verified wallets", () => {
  assert.deepEqual(getLinkedWalletStatus("SIGNED"), {
    signed: true,
    label: "Signed",
    title: "Wallet signed and verified on the server",
  });
  assert.deepEqual(getLinkedWalletStatus("UNSIGNED"), {
    signed: false,
    label: "Unsigned",
    title: "View-only wallet. Sign later to prove ownership",
  });
  assert.equal(getLinkedWalletStatus(undefined).label, "Unsigned");
});

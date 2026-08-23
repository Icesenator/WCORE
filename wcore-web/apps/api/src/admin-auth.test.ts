import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isAdminAuthorized, ADMIN_WALLET_ADDRESS } from "./admin-auth.js";

const LEGACY_TOKEN = "test-admin-token-12345";

describe("admin auth", () => {
  const savedToken = process.env.ADMIN_TOKEN;
  const savedWallet = process.env.ADMIN_WALLET_ADDRESS;

  afterEach(() => {
    if (savedToken !== undefined) process.env.ADMIN_TOKEN = savedToken; else delete process.env.ADMIN_TOKEN;
    if (savedWallet !== undefined) process.env.ADMIN_WALLET_ADDRESS = savedWallet; else delete process.env.ADMIN_WALLET_ADDRESS;
  });

  test("accepts legacy bearer token", () => {
    process.env.ADMIN_TOKEN = LEGACY_TOKEN;
    delete process.env.ADMIN_WALLET_ADDRESS;
    assert.equal(isAdminAuthorized({ headers: { authorization: `Bearer ${LEGACY_TOKEN}` } }), true);
  });

  test("accepts legacy x-admin-token header", () => {
    process.env.ADMIN_TOKEN = LEGACY_TOKEN;
    assert.equal(isAdminAuthorized({ headers: { "x-admin-token": LEGACY_TOKEN } }), true);
  });

  test("rejects wrong legacy token", () => {
    process.env.ADMIN_TOKEN = LEGACY_TOKEN;
    assert.equal(isAdminAuthorized({ headers: { authorization: "Bearer wrong" } }), false);
  });

  test("wallet admin is authorized when address matches", () => {
    delete process.env.ADMIN_TOKEN;
    const wallet = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
    assert.equal(isAdminAuthorized({ headers: {}, user: { id: "u1", address: wallet } }), true);
  });

  test("wallet admin is case-insensitive", () => {
    delete process.env.ADMIN_TOKEN;
    assert.equal(isAdminAuthorized({ headers: {}, user: { id: "u1", address: "0x17D518736EE9341DCDC0A2498E013D33CFCDD080" } }), true);
  });

  test("non-admin wallet is rejected", () => {
    delete process.env.ADMIN_TOKEN;
    assert.equal(isAdminAuthorized({ headers: {}, user: { id: "u1", address: "0x9999999999999999999999999999999999999999" } }), false);
  });

  test("no user means rejected via wallet path", () => {
    delete process.env.ADMIN_TOKEN;
    assert.equal(isAdminAuthorized({ headers: {}, user: undefined }), false);
  });

  test("legacy token still works alongside wallet auth", () => {
    process.env.ADMIN_TOKEN = LEGACY_TOKEN;
    assert.equal(isAdminAuthorized({ headers: { authorization: `Bearer ${LEGACY_TOKEN}` }, user: undefined }), true);
  });

  test("ADMIN_WALLET_ADDRESS env overrides platform owner", () => {
    delete process.env.ADMIN_TOKEN;
    process.env.ADMIN_WALLET_ADDRESS = "0xaaaa000000000000000000000000000000000001";
    assert.equal(isAdminAuthorized({ headers: {}, user: { id: "u1", address: "0xaaaa000000000000000000000000000000000001" } }), true);
    assert.equal(isAdminAuthorized({ headers: {}, user: { id: "u1", address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080" } }), false);
  });

  test("exports the default admin wallet address", () => {
    assert.equal(ADMIN_WALLET_ADDRESS, "0x17d518736ee9341dcdc0a2498e013d33cfcdd080");
  });
});

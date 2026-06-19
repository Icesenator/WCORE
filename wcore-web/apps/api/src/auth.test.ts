// Run: node --import tsx --test apps/api/src/auth.test.ts
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { privateKeyToAccount } from "viem/accounts";
import bs58 from "bs58";
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@cosmjs/crypto";
import { toBase64, toBech32 } from "@cosmjs/encoding";
import { TEST_JWT_SECRET as JWT_SECRET } from "./test-secret.js";
import { app, prisma } from "./server.js";

let ready = false;
const TEST_PRIVATE_KEY = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVATE_KEY);

function authHeader(userId: string, address: string): { authorization: string } {
  const token = jwt.sign({ sub: userId, address: address.toLowerCase(), type: "access" }, JWT_SECRET, { expiresIn: "1h" });
  return { authorization: `Bearer ${token}` };
}

describe("auth nonce/login flow", () => {
  before(async () => {
    if (!ready) {
      await app.ready();
      ready = true;
    }
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  test("GET /api/auth/nonce returns a nonce for a valid address", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/nonce?address=0x1234567890123456789012345678901234567890&chainId=1",
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { nonce?: string; message?: string; error?: string };
    assert.ok(data.nonce);
    assert.ok(data.message?.includes(data.nonce));
  });

  test("GET /api/auth/nonce uses the matching request origin for SIWE", async () => {
    const oldCorsOrigin = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = "https://wcore.xyz,https://web-production-e72584.up.railway.app";
    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/nonce?address=0x1234567890123456789012345678901234567890&chainId=1",
        headers: { origin: "https://web-production-e72584.up.railway.app" },
      });
      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.payload) as { message?: string };
      assert.ok(data.message?.startsWith("web-production-e72584.up.railway.app wants you to sign in"));
      assert.ok(data.message?.includes("URI: https://web-production-e72584.up.railway.app"));
    } finally {
      if (oldCorsOrigin == null) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = oldCorsOrigin;
    }
  });

  test("GET /api/auth/nonce rejects missing address", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/nonce",
    });
    const data = JSON.parse(res.payload) as { error?: string };
    assert.ok(data.error);
  });

  test("POST /api/auth/login rejects invalid signature", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { message: "fake", signature: "0xbad", address: "0x1234567890123456789012345678901234567890" },
    });
    const data = JSON.parse(res.payload) as { error?: string };
    assert.ok(data.error);
  });

  test("POST /api/auth/login rejects without nonce", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { message: "WCORE Login\nWallet: 0xabc", signature: "0x" + "a".repeat(130), address: "0x1234567890123456789012345678901234567890" },
    });
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "invalid_or_expired_nonce");
  });

  test("POST /api/wallets creates a server-synced unsigned wallet without signature", async () => {
    const ownerAddress = "0x1000000000000000000000000000000000000001";
    await prisma.user.deleteMany({ where: { address: ownerAddress } });
    const user = await prisma.user.create({ data: { address: ownerAddress } });
    const linkedAddress = "0x2000000000000000000000000000000000000002";

    const res = await app.inject({
      method: "POST",
      url: "/api/wallets",
      headers: authHeader(user.id, ownerAddress),
      payload: { address: linkedAddress, label: "Treasury", mode: "view_only" },
    });

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { wallet?: { address: string; label: string | null; verificationStatus: string }; error?: string };
    assert.equal(data.error, undefined);
    assert.equal(data.wallet?.address, linkedAddress.toLowerCase());
    assert.equal(data.wallet?.label, "Treasury");
    assert.equal(data.wallet?.verificationStatus, "UNSIGNED");
  });

  test("POST /api/wallets upgrades an existing unsigned wallet after valid signature", async () => {
    const ownerAddress = "0x3000000000000000000000000000000000000003";
    await prisma.user.deleteMany({ where: { address: ownerAddress } });
    const user = await prisma.user.create({ data: { address: ownerAddress } });
    await prisma.linkedWallet.create({
      data: {
        userId: user.id,
        address: TEST_ACCOUNT.address.toLowerCase(),
        label: "Vault",
        chainType: "EVM",
        verificationStatus: "UNSIGNED",
      },
    });

    const nonceRes = await app.inject({ method: "GET", url: `/api/wallets/nonce?address=${TEST_ACCOUNT.address}` });
    const nonceData = JSON.parse(nonceRes.payload) as { message: string };
    const signature = await TEST_ACCOUNT.signMessage({ message: nonceData.message });

    const res = await app.inject({
      method: "POST",
      url: "/api/wallets",
      headers: authHeader(user.id, ownerAddress),
      payload: { address: TEST_ACCOUNT.address, label: "Vault", signature, message: nonceData.message },
    });

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { wallet?: { verificationStatus: string }; error?: string };
    assert.equal(data.error, undefined);
    assert.equal(data.wallet?.verificationStatus, "SIGNED");
  });

  test("POST /api/wallets rejects SVM signatures whose public key does not match the claimed address", async () => {
    const ownerAddress = "0x3100000000000000000000000000000000000003";
    await prisma.user.deleteMany({ where: { address: ownerAddress } });
    const user = await prisma.user.create({ data: { address: ownerAddress } });
    const signerPrivateKey = new Uint8Array(32).fill(1);
    const signerPublicKey = ed25519.getPublicKey(signerPrivateKey);
    const claimedAddress = bs58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(2)));

    const nonceRes = await app.inject({ method: "GET", url: `/api/wallets/nonce?address=${claimedAddress}` });
    const nonceData = JSON.parse(nonceRes.payload) as { message: string };
    const signature = bs58.encode(ed25519.sign(new TextEncoder().encode(nonceData.message), signerPrivateKey));

    const res = await app.inject({
      method: "POST",
      url: "/api/wallets",
      headers: authHeader(user.id, ownerAddress),
      payload: { address: claimedAddress, signature, message: nonceData.message, publicKey: bs58.encode(signerPublicKey) },
    });

    assert.equal(res.statusCode, 400);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "invalid_signature");
  });

  test("POST /api/wallets rejects Cosmos signatures whose public key does not match the claimed address", async () => {
    const ownerAddress = "0x3200000000000000000000000000000000000003";
    await prisma.user.deleteMany({ where: { address: ownerAddress } });
    const user = await prisma.user.create({ data: { address: ownerAddress } });
    const signerPrivateKey = new Uint8Array(32).fill(3);
    const signerPublicKey = secp256k1.getPublicKey(signerPrivateKey, true);
    const otherPublicKey = secp256k1.getPublicKey(new Uint8Array(32).fill(4), true);
    const claimedAddress = toBech32("cosmos", ripemd160(sha256(otherPublicKey)));

    const nonceRes = await app.inject({ method: "GET", url: `/api/wallets/nonce?address=${claimedAddress}` });
    const nonceData = JSON.parse(nonceRes.payload) as { message: string };
    const msgBytes = new TextEncoder().encode(nonceData.message);
    const signature = toBase64(secp256k1.sign(sha256(sha256(msgBytes)), signerPrivateKey));

    const res = await app.inject({
      method: "POST",
      url: "/api/wallets",
      headers: authHeader(user.id, ownerAddress),
      payload: { address: claimedAddress, signature, message: nonceData.message, publicKey: toBase64(signerPublicKey) },
    });

    assert.equal(res.statusCode, 400);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "invalid_signature");
  });

  test("GET /api/leaderboard returns array", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/leaderboard",
    });
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { leaderboard: unknown[] };
    assert.ok(Array.isArray(data.leaderboard));
  });

  // Regression: refresh token must NOT be accepted as an access token via Bearer header.
  // The auth fallback now checks payload.type === "access" (P2 fix).
  test("Bearer header rejects refresh token (type !== access)", async () => {
    const ownerAddress = "0x4000000000000000000000000000000000000004";
    await prisma.user.deleteMany({ where: { address: ownerAddress } });
    const user = await prisma.user.create({ data: { address: ownerAddress } });

    // Sign a refresh token (type: "refresh")
    const refreshToken = jwt.sign(
      { sub: user.id, address: ownerAddress, type: "refresh", jti: "test-jti" },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    // Use it as Bearer — should NOT authenticate
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${refreshToken}` },
    });

    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "not_authenticated");
  });

  // Regression: valid access token via Bearer should still work for backward compat.
  test("Bearer header accepts access token (type === access)", async () => {
    const ownerAddress = "0x4100000000000000000000000000000000000004";
    await prisma.user.deleteMany({ where: { address: ownerAddress } });
    const user = await prisma.user.create({ data: { address: ownerAddress } });

    const accessToken = jwt.sign(
      { sub: user.id, address: ownerAddress, type: "access" },
      JWT_SECRET,
      { expiresIn: "15m" },
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.payload) as { id?: string };
    assert.equal(data.id, user.id);
  });

});

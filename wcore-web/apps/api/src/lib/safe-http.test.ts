import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttp, assertResolvesPublic, isPrivateAddress, safeFetch, UnsafeUrlError } from "./safe-http.js";

// The resolver is injected so these assertions never depend on real DNS.
const resolvesTo = (...addresses: string[]) => async () => addresses.map((address) => ({ address }));

test("isPrivateAddress covers the ranges the old regex missed", () => {
  // fd00::/8 is half of the IPv6 unique-local block and used to pass.
  assert.equal(isPrivateAddress("fd12:3456::1"), true);
  assert.equal(isPrivateAddress("fc00::1"), true);
  // Carrier-grade NAT.
  assert.equal(isPrivateAddress("100.64.0.1"), true);
  // Cloud metadata, the reason this guard exists.
  assert.equal(isPrivateAddress("169.254.169.254"), true);
  // IPv4-mapped IPv6 must be judged on the embedded address.
  assert.equal(isPrivateAddress("::ffff:169.254.169.254"), true);
  assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateAddress("0.0.0.0"), true);
  assert.equal(isPrivateAddress("::"), true);
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("fe80::1"), true);
  assert.equal(isPrivateAddress("224.0.0.1"), true);
  assert.equal(isPrivateAddress("198.18.0.1"), true);
});

test("isPrivateAddress lets real public addresses through", () => {
  assert.equal(isPrivateAddress("1.1.1.1"), false);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
  assert.equal(isPrivateAddress("172.15.0.1"), false); // just outside 172.16/12
  assert.equal(isPrivateAddress("172.32.0.1"), false);
  assert.equal(isPrivateAddress("100.63.255.255"), false); // just outside CGNAT
});

test("isPrivateAddress refuses anything it cannot parse", () => {
  assert.equal(isPrivateAddress("not-an-ip"), true);
  assert.equal(isPrivateAddress("999.1.1.1"), true);
  assert.equal(isPrivateAddress(""), true);
});

test("assertPublicHttp rejects private literals and bad protocols", () => {
  assert.throws(() => assertPublicHttp("http://127.0.0.1:6379"), UnsafeUrlError);
  assert.throws(() => assertPublicHttp("http://169.254.169.254/latest/meta-data"), UnsafeUrlError);
  assert.throws(() => assertPublicHttp("http://[::1]:8545"), UnsafeUrlError);
  assert.throws(() => assertPublicHttp("http://[fd00::1]:8545"), UnsafeUrlError);
  assert.throws(() => assertPublicHttp("file:///etc/passwd"), UnsafeUrlError);
  assert.throws(() => assertPublicHttp("http://localhost:4000"), UnsafeUrlError);
  assert.throws(() => assertPublicHttp("http://redis.internal"), UnsafeUrlError);
  assert.throws(() => assertPublicHttp("not a url"), UnsafeUrlError);
});

test("assertPublicHttp accepts ordinary public endpoints", () => {
  assert.equal(assertPublicHttp("https://mainnet.base.org").hostname, "mainnet.base.org");
  assert.equal(assertPublicHttp("https://1.1.1.1/rpc").hostname, "1.1.1.1");
});

test("assertResolvesPublic rejects a public name pointing at a private address", async () => {
  // A name can be perfectly public and still resolve to the metadata endpoint, which
  // is exactly what the hostname check alone cannot see.
  await assert.rejects(
    assertResolvesPublic(new URL("http://rpc.example.com/"), resolvesTo("169.254.169.254")),
    (e: unknown) => e instanceof UnsafeUrlError && /dns_rebind_169\.254\.169\.254/.test((e as Error).message),
  );
});

test("assertResolvesPublic rejects when any single record is private", async () => {
  // One public A record next to a private AAAA record used to pass, because only a
  // single IPv4 address was ever resolved.
  await assert.rejects(
    assertResolvesPublic(new URL("http://rpc.example.com/"), resolvesTo("8.8.8.8", "fd00::1")),
    UnsafeUrlError,
  );
});

test("assertResolvesPublic accepts a fully public name and skips literals", async () => {
  await assertResolvesPublic(new URL("http://rpc.example.com/"), resolvesTo("8.8.8.8", "2606:4700::1111"));
  // An IP literal needs no DNS at all; the resolver must not even be consulted.
  await assertResolvesPublic(new URL("http://1.1.1.1/"), async () => { throw new Error("resolver must not run"); });
});

test("assertResolvesPublic stays permissive when the name does not resolve", async () => {
  // Nothing can be reached, so failing closed here would only break real endpoints
  // during a DNS outage without adding protection.
  await assertResolvesPublic(new URL("http://rpc.example.com/"), async () => { throw new Error("ENOTFOUND"); });
});

test("safeFetch blocks the request before it is issued", async () => {
  let called = false;
  const fetchImpl = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;

  await assert.rejects(
    safeFetch("http://rpc.example.com", undefined, { resolveAddresses: resolvesTo("10.0.0.5"), fetchImpl }),
    UnsafeUrlError,
  );
  assert.equal(called, false, "the fetch must never be issued for a private target");
});

test("safeFetch passes a legitimate endpoint through untouched", async () => {
  let seen: string | undefined;
  const fetchImpl = (async (input: URL) => { seen = String(input); return new Response("{}"); }) as unknown as typeof fetch;

  const res = await safeFetch("https://mainnet.base.org/", undefined, {
    resolveAddresses: resolvesTo("8.8.8.8"),
    fetchImpl,
  });
  assert.equal(res.status, 200);
  assert.equal(seen, "https://mainnet.base.org/");
});

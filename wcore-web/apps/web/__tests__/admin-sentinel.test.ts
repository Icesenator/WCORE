import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shortHash, safeHttpsUrl, chainDisplayName, splitProposals, kindLabel, statusLabel, type SentinelProposal } from "../lib/admin-sentinel";

const p = (o: Partial<SentinelProposal>): SentinelProposal => ({ id: "a", chainKey: "c", sourceId: "s", url: "https://x.test", previousSha256: null, newSha256: "f".repeat(64), detectedAt: "2026-11-01T00:00:00Z", status: "PENDING_ADMIN_REVIEW", ...o });

describe("admin sentinel helpers", () => {
  test("shortHash", () => {
    assert.equal(shortHash("abcdef0123456789"), "abcdef012345");
    assert.equal(shortHash(null), "—");
  });
  test("safeHttpsUrl n'accepte que https", () => {
    assert.ok(safeHttpsUrl("https://example.com/a"));
    for (const u of ["http://example.com", "javascript:alert(1)", "data:text/html,x", "nope", "", null, undefined]) assert.equal(safeHttpsUrl(u), null);
  });
  test("chainDisplayName retombe sur la cle", () => {
    assert.equal(chainDisplayName("k", [{ chainKey: "k", name: "Nom" }]), "Nom");
    assert.equal(chainDisplayName("z", []), "z");
  });
  test("splitProposals separe et trie", () => {
    const { pending, decided } = splitProposals([
      p({ id: "1", detectedAt: "2026-11-01T00:00:00Z" }),
      p({ id: "2", detectedAt: "2026-11-05T00:00:00Z" }),
      p({ id: "3", status: "REJECTED", decidedAt: "2026-11-02T00:00:00Z" }),
      p({ id: "4", status: "APPROVED", decidedAt: "2026-11-09T00:00:00Z" }),
    ]);
    assert.deepEqual(pending.map((x) => x.id), ["2", "1"]);
    assert.deepEqual(decided.map((x) => x.id), ["4", "3"]);
  });
  test("libelles", () => {
    assert.match(kindLabel("ANNOUNCEMENT_KEYWORD"), /fermeture/);
    assert.equal(statusLabel("REJECTED"), "Rejetée");
  });
});

describe("SentinelTab (source)", () => {
  const src = readFileSync(new URL("../app/admin/SentinelTab.tsx", import.meta.url), "utf8");
  test("liens externes sans fuite d'opener, appels admin avec cookie, jamais APPROVED", () => {
    assert.match(src, /target="_blank" rel="noopener noreferrer"/);
    assert.match(src, /\/api\/admin\/sentinel\/proposals/);
    assert.match(src, /credentials: "include"/);
    assert.doesNotMatch(src, /decision: "APPROVED"/);
    assert.doesNotMatch(src, /dangerouslySetInnerHTML/);
  });
  test("branchee dans l'onglet admin", () => {
    const admin = readFileSync(new URL("../app/admin/AdminClient.tsx", import.meta.url), "utf8");
    assert.match(admin, /<SentinelTab \/>/);
  });
});

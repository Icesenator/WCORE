import { test } from "node:test";
import assert from "node:assert/strict";
import { createQuotaWindow, validateQuotaPolicy } from "./quota.js";
import type { QuoteQuotaPolicy } from "./quota.js";

const policy: QuoteQuotaPolicy = {
  attestation: "SYNTHETIC", limit: 2, windowMs: 100, source: null,
};

for (const invalid of [NaN, Infinity, -Infinity, -1]) {
  test(`horloge ${String(invalid)} avant première admission : refus sans consommation`, () => {
    let now = invalid;
    const quota = createQuotaWindow(policy, { now: () => now });
    assert.equal(quota.admit("p"), "REFUSED_QUOTA_CLOCK_INVALID");
    assert.equal(quota.used("p"), 0);
    now = 0;
    assert.equal(quota.admit("p"), "ADMITTED");
    assert.equal(quota.used("p"), 1);
  });

  test(`horloge ${String(invalid)} pendant fenêtre : refus sans mutation`, () => {
    let now = 100;
    const quota = createQuotaWindow(policy, { now: () => now });
    assert.equal(quota.admit("p"), "ADMITTED");
    now = invalid;
    assert.equal(quota.admit("p"), "REFUSED_QUOTA_CLOCK_INVALID");
    assert.equal(quota.used("p"), 1);
    now = 100;
    assert.equal(quota.admit("p"), "ADMITTED");
    assert.equal(quota.used("p"), 2);
  });
}

test("rollback après observation valide dans fenêtre : refus jusqu'au rattrapage", () => {
  let now = 100;
  const quota = createQuotaWindow({ ...policy, limit: 3 }, { now: () => now });
  assert.equal(quota.admit("p"), "ADMITTED");
  now = 150;
  assert.equal(quota.admit("p"), "ADMITTED");
  now = 149;
  assert.equal(quota.admit("p"), "REFUSED_QUOTA_CLOCK_INVALID");
  assert.equal(quota.used("p"), 2);
  // Même un provider encore vierge ne contourne pas l'horloge de l'instance.
  assert.equal(quota.admit("new"), "REFUSED_QUOTA_CLOCK_INVALID");
  assert.equal(quota.used("new"), 0);
  now = 150;
  assert.equal(quota.admit("p"), "ADMITTED");
});

test("une observation refusée pour épuisement établit aussi le repère monotone", () => {
  let now = 100;
  const quota = createQuotaWindow({ ...policy, limit: 1 }, { now: () => now });
  assert.equal(quota.admit("p"), "ADMITTED");
  now = 190;
  assert.equal(quota.admit("p"), "REFUSED_QUOTA_EXCEEDED");
  now = 180;
  assert.equal(quota.admit("new"), "REFUSED_QUOTA_CLOCK_INVALID");
  assert.equal(quota.used("new"), 0);
});

test("frontière exacte : fenêtre fixe locale, non rolling fournisseur", () => {
  let now = 100;
  const quota = createQuotaWindow(policy, { now: () => now });
  assert.equal(quota.admit("p"), "ADMITTED");
  now = 199;
  assert.equal(quota.admit("p"), "ADMITTED");
  assert.equal(quota.admit("p"), "REFUSED_QUOTA_EXCEEDED");
  now = 200;
  assert.equal(quota.admit("p"), "ADMITTED");
  assert.equal(quota.used("p"), 1);
  assert.equal(quota.admit("p"), "ADMITTED");
  assert.equal(quota.admit("p"), "REFUSED_QUOTA_EXCEEDED");
});

test("rafale concurrente dans une boucle JS : réservations synchrones bornées", async () => {
  const quota = createQuotaWindow({ ...policy, limit: 3 }, { now: () => 100 });
  const pending = Array.from({ length: 20 }, async () => quota.admit("p"));
  // Aucun await nécessaire à la réservation : tout est déjà consommé.
  assert.equal(quota.used("p"), 3);
  const decisions = await Promise.all(pending);
  assert.equal(decisions.filter((d) => d === "ADMITTED").length, 3);
  assert.equal(decisions.filter((d) => d === "REFUSED_QUOTA_EXCEEDED").length, 17);
});

test("redémarrage simulé : quota mémoire perdu, pas de garantie inter-instance", () => {
  const create = () => createQuotaWindow({ ...policy, limit: 1 }, { now: () => 100 });
  const before = create();
  assert.equal(before.admit("p"), "ADMITTED");
  assert.equal(before.admit("p"), "REFUSED_QUOTA_EXCEEDED");
  const restarted = create();
  assert.equal(restarted.used("p"), 0);
  assert.equal(restarted.admit("p"), "ADMITTED");
});

test("UNATTESTED refuse avant lecture d'horloge, même invalide", () => {
  let reads = 0;
  const quota = createQuotaWindow({ ...policy, attestation: "UNATTESTED" }, {
    now: () => { reads++; return NaN; },
  });
  assert.equal(quota.admit("p"), "REFUSED_QUOTA_UNATTESTED");
  assert.equal(quota.used("p"), 0);
  assert.equal(reads, 0);
});

test("limite d'admissions : entier sûr requis pour un comptage exact", () => {
  assert.throws(() => validateQuotaPolicy({ ...policy, limit: Number.MAX_SAFE_INTEGER + 1 }), /INVALID_QUOTA_POLICY/);
  assert.equal(validateQuotaPolicy({ ...policy, limit: Number.MAX_SAFE_INTEGER }).limit, Number.MAX_SAFE_INTEGER);
});

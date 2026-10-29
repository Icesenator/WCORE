// WC-06 — alignement de l'expiration du cache packed avec la préservation des wallets positifs.
// Garde STATIQUE (source-level) : le comportement d'exécution Apps Script n'est pas simulé ici.
// Preuve de présence et d'ordre des gardes documentées v4.13.4 (3 tiers) et v4.15.7 (quota épuisé).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "04B_CACHE_WALLET.gs"), "utf8");

test("WC-06 : le prune taille protège les entrées avec balance (tier 1, jamais évincées)", () => {
  assert.match(src, /Never evict entries with actual balance data/i);
  assert.match(src, /_packedEntryHasPositiveBalance_/, "classificateur de balance présent");
  assert.match(src, /hasBalance/);
});

test("WC-06 : l'ordre des tiers place balance > recent > ancien", () => {
  // Comparateur documenté : balance d'abord (protégé), puis recent (<1h), puis plus ancien évincé.
  assert.match(src, /Tier 1: entries with balance are MOST protected/);
  assert.match(src, /Tier 2: recent entries are protected/);
  assert.match(src, /oldest first \(evicted first\)/i);
  assert.match(src, /recentCutoff = nowSec - 3600/, "protection 1h");
});

test("WC-06 : le prune taille est sauté quand le quota est épuisé (pas d'éviction sous contention)", () => {
  assert.match(src, /Skip size prune when quota is exhausted/i);
});

test("WC-06 : compteurs de protection exposés (protectedBalance / protectedRecent)", () => {
  assert.match(src, /protectedBalance/);
  assert.match(src, /protectedRecent/);
});

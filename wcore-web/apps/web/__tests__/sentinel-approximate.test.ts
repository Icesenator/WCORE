import { test } from "node:test";
import assert from "node:assert/strict";
import { VERIFIED_LIFECYCLE_REGISTRY } from "@wcore/shared";
import { formatDeadlineAt, formatDeadlineCountdown } from "../lib/sentinel-view";

// Signal WCORE CM du 18/11 : la fiche ZetaChain affichait « 2026-12-09 00:00 UTC » alors que le blog
// officiel n'annonce qu'un arret « around Dec 9 », sans heure. L'heure interne (debut de journee UTC,
// lecture la plus prudente pour les alertes) ne doit jamais etre affichee comme publiee.

test("an approximate deadline shows only the day, in both languages", () => {
  assert.equal(formatDeadlineAt("2026-12-09T00:00:00Z", true, "fr"), "vers le 2026-12-09 (heure non annoncée)");
  assert.equal(formatDeadlineAt("2026-12-09T00:00:00Z", true, "en"), "around 2026-12-09 (time not announced)");
  assert.ok(!formatDeadlineAt("2026-12-09T00:00:00Z", true, "en").includes("00:00"));
});

test("a precise deadline keeps its published hour", () => {
  assert.equal(formatDeadlineAt("2026-12-31T00:00:00Z", false, "en"), "2026-12-31 00:00 UTC");
  assert.equal(formatDeadlineAt("2026-12-31T00:00:00Z", undefined, "fr"), "2026-12-31 00:00 UTC");
});

test("ZetaChain: a single approximate shutdown deadline, no misleading last-withdrawal date", () => {
  const zeta = VERIFIED_LIFECYCLE_REGISTRY.find((r) => r.chainKey === "zetachain");
  assert.ok(zeta);
  assert.deepEqual(zeta.deadlines.map((d) => d.kind), ["NETWORK_SHUTDOWN"]);
  assert.ok(zeta.deadlines.every((d) => d.approximate === true));
});

const H = 3600000;

test("an approximate deadline is never shown as overdue on the announced days", () => {
  assert.match(formatDeadlineCountdown(5 * 24 * H, true, "en"), /^≈ in 5 d/);
  assert.equal(formatDeadlineCountdown(-1 * H, true, "en"), "expected around now (exact time not published)");
  assert.equal(formatDeadlineCountdown(-30 * H, true, "fr"), "attendu ces jours-ci (heure exacte non publiée)");
  // After the two announced days: a delay in days only, never to the hour.
  assert.equal(formatDeadlineCountdown(-(3 * 24 + 5) * H, true, "en"), "announced day passed (about 3 d ago)");
  assert.equal(formatDeadlineCountdown(-(3 * 24 + 5) * H, true, "fr"), "jour annoncé passé (il y a environ 3 j)");
  assert.doesNotMatch(formatDeadlineCountdown(-(3 * 24 + 5) * H, true, "en"), / h\b/);
});

test("a precise deadline keeps the usual countdown", () => {
  assert.match(formatDeadlineCountdown(-1 * H, false, "en"), /^overdue by/);
  assert.match(formatDeadlineCountdown(2 * H, undefined, "fr"), /^dans 2 h/);
});

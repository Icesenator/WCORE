import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatCountdown, sentinelText, statusLabel, codeLabel, deadlineLabel, recoveryLabel,
  STATUS_LABEL, CODE_LABEL, DEADLINE_LABEL, type SentinelLang,
} from "../lib/sentinel-view";

// The site offers French and English (PreferencesProvider, lib/i18n.ts). Chain Sentinel was
// written in French only: these tests pin the English rendering and keep both languages complete.
const H = 3600000, D = 24 * H;
const LANGS: SentinelLang[] = ["fr", "en"];
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

test("formatCountdown : anglais, français par défaut inchangé", () => {
  assert.equal(formatCountdown(3 * D + 2 * H, "en"), "in 3 d 2 h");
  assert.equal(formatCountdown(-(5 * H + 30 * 60000), "en"), "overdue by 5 h 30 min");
  assert.equal(formatCountdown(4 * 60000, "en"), "in 4 min");
  assert.equal(formatCountdown(null, "en"), "—");
  assert.equal(formatCountdown(3 * D + 2 * H), "dans 3 j 2 h");
  assert.equal(formatCountdown(3 * D + 2 * H, "fr"), "dans 3 j 2 h");
});

test("libellés : chaque statut, code, échéance et récupération existe dans les deux langues, et diffère", () => {
  for (const s of Object.keys(STATUS_LABEL)) {
    for (const l of LANGS) assert.ok(statusLabel(s as never, l), `${s} ${l}`);
    assert.notEqual(statusLabel(s as never, "en"), statusLabel(s as never, "fr"), s);
  }
  for (const c of Object.keys(CODE_LABEL)) assert.notEqual(codeLabel(c, "en"), codeLabel(c, "fr"), c);
  for (const k of Object.keys(DEADLINE_LABEL)) assert.notEqual(deadlineLabel(k, "en"), deadlineLabel(k, "fr"), k);
  for (const r of ["AVAILABLE", "PLANNED", "NOT_AVAILABLE", "UNKNOWN"] as const) assert.notEqual(recoveryLabel(r, "en"), recoveryLabel(r, "fr"), r);
  assert.equal(statusLabel("WINDING_DOWN", "en"), "Shutdown announced");
  assert.equal(codeLabel("ACTION_REQUIRED_BEFORE_DEADLINE", "en"), "Action required before the deadline");
  assert.equal(deadlineLabel("WITHDRAW_LAST", "en"), "Last withdrawal");
});

test("libellés : un code inconnu reste affiché tel quel", () => {
  assert.equal(codeLabel("NEW_CODE", "en"), "NEW_CODE");
  assert.equal(deadlineLabel("NEW_KIND", "fr"), "NEW_KIND");
});

test("textes de page : mêmes clés dans les deux langues, aucune vide, l'anglais n'est pas une copie", () => {
  const fr = sentinelText("fr"), en = sentinelText("en");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  for (const [key, value] of Object.entries(en)) {
    const sample = typeof value === "function" ? (value as (...a: unknown[]) => string)("X", 1, 2) : value;
    assert.ok(typeof sample === "string" && sample.length > 0, key);
  }
  assert.equal(en.alertsTitle, "Alerts");
  assert.equal(en.chainsTitle, "Monitored chains");
  assert.equal(en.lastCheck("2026-11-09 20:42 UTC", 9, 0), "Last automatic check: 2026-11-09 20:42 UTC · 9 source(s), 0 failed.");
});

test("composants Sentinel : aucun texte français codé en dur", () => {
  const frenchLiterals = ["Connectez-vous", "Chaînes surveillées", "Accuser réception", "Voir les alertes", "Aucune alerte", "Chargement…",
    "Registre indisponible", "Surveillance", "Récupération", "non officielle", "aucune source", "non acquittée", "Fermetures et migrations"];
  for (const file of ["app/sentinel/SentinelClient.tsx", "components/SentinelNotificationBell.tsx", "components/SentinelChainBadge.tsx"]) {
    // Comments stay in French (project convention); only rendered text is checked.
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const literal of frenchLiterals) assert.ok(!src.includes(literal), `${file} contient « ${literal} »`);
  }
});

test("composants Sentinel : la langue vient des préférences du site", () => {
  for (const file of ["app/sentinel/SentinelClient.tsx", "components/SentinelNotificationBell.tsx", "components/SentinelChainBadge.tsx"]) {
    assert.match(read(file), /usePreferences\(\)/, file);
  }
});

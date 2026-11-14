import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeGeneralStreak } from "./gm-streak-merge.js";

const DAY_MS = 86_400_000;
const NOW = new Date(Date.UTC(2026, 10, 14, 10, 0, 0)); // 14/11/2026 10:00 UTC
const at = (offsetDays: number, hour = 8) => new Date(Date.UTC(2026, 10, 14) + offsetDays * DAY_MS + hour * 3_600_000);

test("a valid stored streak is not lowered by an on-chain-only recomputation (the reported bug)", () => {
  // 30 jours au bouton gratuit, dernier GM hier ; un GM en chaine aujourd'hui, serie en chaine = 2.
  const r = mergeGeneralStreak({
    computedStreak: 2, computedLongest: 2, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 30, longestStreak: 30, lastGmDate: at(-1) }, now: NOW,
  });
  assert.equal(r.gmStreak, 31, "yesterday's stored streak continues with today's on-chain GM");
  assert.equal(r.longestStreak, 31);
  assert.equal(r.changed, true);
});

test("same day, a second recomputation is idempotent: the day is counted once", () => {
  const first = mergeGeneralStreak({
    computedStreak: 2, computedLongest: 2, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 30, longestStreak: 30, lastGmDate: at(-1) }, now: NOW,
  });
  const second = mergeGeneralStreak({
    computedStreak: 2, computedLongest: 2, latestEventMs: at(0).getTime(),
    stored: { gmStreak: first.gmStreak, longestStreak: first.longestStreak, lastGmDate: first.lastGmDate }, now: NOW,
  });
  assert.equal(second.gmStreak, 31);
  assert.equal(second.changed, false);
});

test("stored streak already counted today is kept", () => {
  const r = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: at(0, 9).getTime(),
    stored: { gmStreak: 12, longestStreak: 15, lastGmDate: at(0, 7) }, now: NOW,
  });
  assert.equal(r.gmStreak, 12);
  assert.equal(r.longestStreak, 15);
});

test("an expired stored streak is not resurrected: the on-chain value applies", () => {
  const r = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 30, longestStreak: 30, lastGmDate: at(-5) }, now: NOW,
  });
  assert.equal(r.gmStreak, 1);
  assert.equal(r.longestStreak, 30, "the record is never lowered");
});

test("a longer on-chain streak still wins", () => {
  const r = mergeGeneralStreak({
    computedStreak: 9, computedLongest: 9, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 3, longestStreak: 3, lastGmDate: at(-1) }, now: NOW,
  });
  assert.equal(r.gmStreak, 9);
  assert.equal(r.longestStreak, 9);
});

test("lastGmDate never goes backwards", () => {
  const r = mergeGeneralStreak({
    computedStreak: 0, computedLongest: 4, latestEventMs: at(-3).getTime(),
    stored: { gmStreak: 5, longestStreak: 5, lastGmDate: at(-1) }, now: NOW,
  });
  assert.equal(r.lastGmDate?.getTime(), at(-1).getTime());
  assert.equal(r.gmStreak, 5, "stored streak (last GM yesterday) still valid");
});

test("a slightly future stored lastGmDate (clock drift) is not judged expired", () => {
  const r = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: at(0).getTime(),
    stored: { gmStreak: 12, longestStreak: 12, lastGmDate: at(1, 2) }, now: NOW,
  });
  assert.equal(r.gmStreak, 12);
  assert.equal(r.lastGmDate?.getTime(), at(1, 2).getTime(), "lastGmDate never goes backwards");
});

test("no stored date and no event: nothing changes", () => {
  const r = mergeGeneralStreak({
    computedStreak: 0, computedLongest: 0, latestEventMs: null,
    stored: { gmStreak: 0, longestStreak: 0, lastGmDate: null }, now: NOW,
  });
  assert.deepEqual({ s: r.gmStreak, l: r.longestStreak, d: r.lastGmDate, c: r.changed }, { s: 0, l: 0, d: null, c: false });
});

test("the UTC day boundary decides: 23:30 UTC yesterday is yesterday, 00:30 UTC today is today", () => {
  const r = mergeGeneralStreak({
    computedStreak: 1, computedLongest: 1, latestEventMs: Date.UTC(2026, 10, 14, 0, 30),
    stored: { gmStreak: 7, longestStreak: 7, lastGmDate: new Date(Date.UTC(2026, 10, 13, 23, 30)) }, now: NOW,
  });
  assert.equal(r.gmStreak, 8);
});

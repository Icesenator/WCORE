import { describe, expect, it } from "vitest";
import { detectScam } from "./scam-detector";

describe("WHSPR (Base) is blocked", () => {
  it("flags the WHSPR contract reported by the owner on 2026-11-19, whatever the address case", () => {
    const r = detectScam("WHSPR", "Whispr", 1000, null, "0x25DE2124333F13D47CCDCDFFB373E7AB5874F41B");
    expect(r.level).toBe("scam");
    expect(r.reasons).toContain("blocked contract");
  });
});

import { describe, it, expect } from "vitest";
import {
  generatePairingCode,
  hashToken,
  isPairingExpired,
  mintRandomToken,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_REGEX,
} from "@/lib/health-pairing";

describe("health-pairing helpers", () => {
  it("generatePairingCode is 6 chars from the unambiguous alphabet", () => {
    for (let i = 0; i < 20; i++) {
      const code = generatePairingCode();
      expect(code).toMatch(PAIRING_CODE_REGEX);
      expect(code.length).toBe(PAIRING_CODE_LENGTH);
      for (const ch of code) {
        expect(PAIRING_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it("generatePairingCode alphabet excludes ambiguous glyphs 0/O/1/I/L", () => {
    for (const ch of "01ILO") {
      expect(PAIRING_CODE_ALPHABET.includes(ch)).toBe(false);
    }
  });

  it("generatePairingCode is not trivially repeating", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generatePairingCode());
    // 32^6 ≈ 1B combos; collisions in 50 draws are vanishingly unlikely.
    expect(seen.size).toBeGreaterThan(5);
  });

  it("mintRandomToken returns a URL-safe string of expected length", () => {
    const t = mintRandomToken();
    // 32 random bytes → 43 base64url chars (no padding).
    expect(t).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it("hashToken is deterministic and 64 hex chars (sha256)", () => {
    const t = "abc123";
    const a = hashToken(t);
    const b = hashToken(t);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("isPairingExpired compares against the provided now", () => {
    const now = new Date("2026-05-23T12:00:00Z");
    const past = new Date("2026-05-23T11:50:00Z");
    const future = new Date("2026-05-23T12:05:00Z");
    expect(isPairingExpired(past, now)).toBe(true);
    expect(isPairingExpired(future, now)).toBe(false);
  });
});

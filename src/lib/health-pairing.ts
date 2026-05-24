import { randomBytes, randomInt, createHash } from "node:crypto";

// Crockford-style alphanumeric alphabet (31 chars). Excludes 0/O and
// 1/I/L to avoid hand-transcription ambiguity.
export const PAIRING_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PAIRING_CODE_LENGTH = 6;
export const PAIRING_CODE_REGEX = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

// 6-char alphanumeric pairing code (~1B combinations). Uses
// crypto.randomInt to avoid modulo bias.
export function generatePairingCode(): string {
  let s = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    s += PAIRING_CODE_ALPHABET[randomInt(0, PAIRING_CODE_ALPHABET.length)];
  }
  return s;
}

// 256-bit random token, base64url-encoded for safe transport in headers.
export function mintRandomToken(): string {
  return randomBytes(32).toString("base64url");
}

// sha256 of the plaintext token (hex). The DB stores the hash; the
// plaintext lives only on the iOS Keychain.
export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

// Pure expiry check (no clock reads inside the lib).
export function isPairingExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

// Lifetime constants. Pairing codes are short-lived; tokens are
// non-expiring until explicitly revoked.
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

import { randomBytes, randomInt, createHash } from "node:crypto";

// 6-digit numeric pairing code. Uses crypto.randomInt to avoid modulo bias.
export function generatePairingCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
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

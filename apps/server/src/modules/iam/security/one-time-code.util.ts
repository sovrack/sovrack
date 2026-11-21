import { randomInt, timingSafeEqual } from 'crypto';
import { CryptoService } from '../../../shared/crypto/crypto.service';

export type OneTimeCodePurpose =
  'email-verification' | 'password-reset' | 'account-deletion';

type SealedOneTimeCode = {
  code: string;
  purpose: OneTimeCodePurpose;
  userId: string;
  attemptId?: string;
};

export function generateOneTimeCode(): string {
  return randomInt(100_000, 1_000_000).toString();
}

export function sealOneTimeCode(
  crypto: CryptoService,
  value: SealedOneTimeCode,
): string {
  return crypto.encrypt(JSON.stringify(value));
}

export function verifyOneTimeCode(
  crypto: CryptoService,
  sealedOrLegacyCode: string,
  expected: SealedOneTimeCode,
): boolean {
  // Transitional compatibility: old pending codes were stored as six plaintext
  // digits. They expire naturally in ten minutes and disappear after use.
  if (/^\d{6}$/.test(sealedOrLegacyCode)) {
    return safeEqual(sealedOrLegacyCode, expected.code);
  }

  try {
    const decoded = JSON.parse(
      crypto.decrypt(sealedOrLegacyCode),
    ) as Partial<SealedOneTimeCode>;
    return (
      decoded.purpose === expected.purpose &&
      decoded.userId === expected.userId &&
      decoded.attemptId === expected.attemptId &&
      typeof decoded.code === 'string' &&
      safeEqual(decoded.code, expected.code)
    );
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

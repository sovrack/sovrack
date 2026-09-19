import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const PERIOD_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function matchTotp(secret: string, code: string): bigint | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(Date.now() / 1000 / PERIOD_SECONDS);
  for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
    const step = BigInt(current + offset);
    const expected = totp(secret, step);
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(code);
    if (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      return step;
    }
  }
  return null;
}

export function createRecoveryCode(): string {
  const bytes = randomBytes(12);
  const raw = Array.from(
    bytes,
    (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length],
  ).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function hashRecoveryCode(
  secret: string,
  namespace: string,
  identityId: string,
  code: string,
): string {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return createHmac('sha256', secret)
    .update(`${namespace}\u0000${identityId}\u0000${normalized}`)
    .digest('hex');
}

export function buildTotpAuthUri(
  issuer: string,
  email: string,
  secret: string,
): string {
  return (
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}` +
    `?secret=${secret}&issuer=${encodeURIComponent(issuer)}` +
    `&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD_SECONDS}`
  );
}

function totp(secret: string, step: bigint): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(step);
  const digest = createHmac('sha1', base32Decode(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) >>>
    0;
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

function base32Encode(value: Buffer): string {
  let bits = '';
  for (const byte of value) bits += byte.toString(2).padStart(8, '0');
  let encoded = '';
  for (let index = 0; index < bits.length; index += 5) {
    encoded +=
      BASE32_ALPHABET[
        Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)
      ];
  }
  return encoded;
}

function base32Decode(value: string): Buffer {
  let bits = '';
  for (const character of value.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid TOTP secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

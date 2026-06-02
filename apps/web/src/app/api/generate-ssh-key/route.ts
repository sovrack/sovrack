import { generateKeyPairSync } from 'crypto';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = (await req.json()) as { type?: string };
  const type = body.type === 'rsa' ? 'rsa' : 'ed25519';

  try {
    if (type === 'ed25519') {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });

      const pubSsh = pemToSshEd25519(publicKey);

      return NextResponse.json({
        privateKey: pemToOpenSsh(privateKey),
        publicKey: pubSsh,
        keyType: 'ed25519',
      });
    }

    // RSA 4096
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 4096,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const pubSsh = pemToSshRsa(publicKey);

    return NextResponse.json({
      privateKey,
      publicKey: pubSsh,
      keyType: 'rsa',
    });
  } catch (err) {
    console.error('Key generation error:', err);
    return NextResponse.json({ error: 'Key generation failed' }, { status: 500 });
  }
}

function pemToOpenSsh(pkcs8Pem: string): string {
  // Convert PKCS8 PEM to OpenSSH PEM format for ed25519
  // Node crypto doesn't directly export OpenSSH format for ed25519 in older versions
  // We return the PKCS8 format which is widely supported
  return pkcs8Pem;
}

function pemToSshEd25519(spkiPem: string): string {
  const lines = spkiPem.split('\n').filter((l) => !l.startsWith('-----'));
  const der = Buffer.from(lines.join(''), 'base64');
  // SPKI for ed25519: 12 bytes header + 32 bytes key
  const keyBytes = der.slice(der.length - 32);

  const prefix = Buffer.from('ssh-ed25519');
  const prefixLen = Buffer.alloc(4);
  prefixLen.writeUInt32BE(prefix.length, 0);

  const keyLen = Buffer.alloc(4);
  keyLen.writeUInt32BE(keyBytes.length, 0);

  const blob = Buffer.concat([prefixLen, prefix, keyLen, keyBytes]);
  return `ssh-ed25519 ${blob.toString('base64')} generated-key`;
}

function pemToSshRsa(spkiPem: string): string {
  const lines = spkiPem.split('\n').filter((l) => !l.startsWith('-----'));
  const der = Buffer.from(lines.join(''), 'base64');

  // Parse RSA SPKI to extract modulus and exponent
  // SPKI structure: SEQUENCE { SEQUENCE { OID, NULL }, BIT STRING { SEQUENCE { INTEGER (modulus), INTEGER (exponent) } } }
  const parsed = parseRsaSpki(der);
  if (!parsed) {
    return `ssh-rsa ${Buffer.from(spkiPem).toString('base64')}`;
  }

  const { modulus, exponent } = parsed;
  const typeStr = 'ssh-rsa';
  const typeLen = Buffer.alloc(4);
  typeLen.writeUInt32BE(typeStr.length, 0);

  const expBuf = mpint(exponent);
  const modBuf = mpint(modulus);

  const blob = Buffer.concat([typeLen, Buffer.from(typeStr), expBuf, modBuf]);
  return `ssh-rsa ${blob.toString('base64')} generated-key`;
}

function mpint(buf: Buffer): Buffer {
  // Strip leading zeros, add one if high bit set
  let start = 0;
  while (start < buf.length - 1 && buf[start] === 0) start++;
  const stripped = buf.slice(start);
  const needsPad = (stripped[0] & 0x80) !== 0;
  const data = needsPad ? Buffer.concat([Buffer.from([0]), stripped]) : stripped;
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, data]);
}

function parseRsaSpki(der: Buffer): { modulus: Buffer; exponent: Buffer } | null {
  try {
    let pos = 0;
    pos = skipSeqHeader(der, pos); // outer SEQUENCE
    pos = skipSeqHeader(der, pos); // algorithm SEQUENCE
    pos = skipElement(der, pos);   // OID
    pos = skipElement(der, pos);   // NULL
    // BIT STRING
    if (der[pos] !== 0x03) return null;
    pos++;
    const bsLen = readLength(der, pos);
    pos += bsLen.consumed + 1; // skip unused bits byte
    // Inner SEQUENCE
    pos = skipSeqHeader(der, pos);
    // Modulus INTEGER
    if (der[pos] !== 0x02) return null;
    pos++;
    const modLenInfo = readLength(der, pos);
    pos += modLenInfo.consumed;
    const modulus = der.slice(pos, pos + modLenInfo.value);
    pos += modLenInfo.value;
    // Exponent INTEGER
    if (der[pos] !== 0x02) return null;
    pos++;
    const expLenInfo = readLength(der, pos);
    pos += expLenInfo.consumed;
    const exponent = der.slice(pos, pos + expLenInfo.value);
    return { modulus, exponent };
  } catch {
    return null;
  }
}

function readLength(buf: Buffer, pos: number): { value: number; consumed: number } {
  if (buf[pos] < 0x80) return { value: buf[pos], consumed: 1 };
  const n = buf[pos] & 0x7f;
  let val = 0;
  for (let i = 0; i < n; i++) val = (val << 8) | buf[pos + 1 + i];
  return { value: val, consumed: 1 + n };
}

function skipSeqHeader(buf: Buffer, pos: number): number {
  if (buf[pos] !== 0x30) throw new Error('Expected SEQUENCE');
  pos++;
  const info = readLength(buf, pos);
  return pos + info.consumed;
}

function skipElement(buf: Buffer, pos: number): number {
  pos++; // tag
  const info = readLength(buf, pos);
  return pos + info.consumed + info.value;
}

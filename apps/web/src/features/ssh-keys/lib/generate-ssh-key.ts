export type GeneratedSshKey = {
  privateKey: string;
  publicKey: string;
  keyType: "ed25519" | "rsa";
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

function toPem(label: string, der: ArrayBuffer): string {
  const encoded = toBase64(new Uint8Array(der));
  const lines = encoded.match(/.{1,64}/g)?.join("\n") ?? encoded;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
}

function uint32(value: number): Uint8Array {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, value);
  return result;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function sshString(value: Uint8Array): Uint8Array {
  return concat(uint32(value.length), value);
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function readLength(bytes: Uint8Array, offset: number) {
  const first = bytes[offset];
  if (first === undefined) throw new Error("Clé DER tronquée");
  if (first < 0x80) return { value: first, consumed: 1 };
  const count = first & 0x7f;
  if (count === 0 || count > 4) throw new Error("Longueur DER invalide");
  let value = 0;
  for (let index = 0; index < count; index += 1) {
    const byte = bytes[offset + 1 + index];
    if (byte === undefined) throw new Error("Clé DER tronquée");
    value = value * 256 + byte;
  }
  return { value, consumed: 1 + count };
}

function readElement(bytes: Uint8Array, offset: number, tag: number) {
  if (bytes[offset] !== tag) throw new Error("Structure DER inattendue");
  const length = readLength(bytes, offset + 1);
  const start = offset + 1 + length.consumed;
  const end = start + length.value;
  if (end > bytes.length) throw new Error("Clé DER tronquée");
  return { start, end };
}

function rsaPartsFromSpki(spki: ArrayBuffer) {
  const bytes = new Uint8Array(spki);
  const outer = readElement(bytes, 0, 0x30);
  const algorithm = readElement(bytes, outer.start, 0x30);
  const bitString = readElement(bytes, algorithm.end, 0x03);
  if (bytes[bitString.start] !== 0) throw new Error("BIT STRING DER invalide");
  const sequence = readElement(bytes, bitString.start + 1, 0x30);
  const modulus = readElement(bytes, sequence.start, 0x02);
  const exponent = readElement(bytes, modulus.end, 0x02);
  return {
    modulus: bytes.slice(modulus.start, modulus.end),
    exponent: bytes.slice(exponent.start, exponent.end),
  };
}

function mpint(value: Uint8Array): Uint8Array {
  let offset = 0;
  while (offset < value.length - 1 && value[offset] === 0) offset += 1;
  const normalized = value.slice(offset);
  const positive =
    (normalized[0] & 0x80) !== 0
      ? concat(new Uint8Array([0]), normalized)
      : normalized;
  return sshString(positive);
}

export async function generateSshKeyPair(
  keyType: "ed25519" | "rsa",
): Promise<GeneratedSshKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto n’est pas disponible dans ce navigateur");
  }

  if (keyType === "ed25519") {
    const keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const [privateDer, publicDer] = await Promise.all([
      crypto.subtle.exportKey("pkcs8", keys.privateKey),
      crypto.subtle.exportKey("spki", keys.publicKey),
    ]);
    const publicBytes = new Uint8Array(publicDer).slice(-32);
    const algorithm = text("ssh-ed25519");
    const blob = concat(sshString(algorithm), sshString(publicBytes));
    return {
      privateKey: toPem("PRIVATE KEY", privateDer),
      publicKey: `ssh-ed25519 ${toBase64(blob)} sovrack-browser`,
      keyType,
    };
  }

  const keys = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const [privateDer, publicDer] = await Promise.all([
    crypto.subtle.exportKey("pkcs8", keys.privateKey),
    crypto.subtle.exportKey("spki", keys.publicKey),
  ]);
  const { modulus, exponent } = rsaPartsFromSpki(publicDer);
  const algorithm = text("ssh-rsa");
  const blob = concat(sshString(algorithm), mpint(exponent), mpint(modulus));
  return {
    privateKey: toPem("PRIVATE KEY", privateDer),
    publicKey: `ssh-rsa ${toBase64(blob)} sovrack-browser`,
    keyType,
  };
}

declare module 'sshpk' {
  export interface Key {
    toBuffer(format?: string, options?: { passphrase?: string }): Buffer;
    fingerprint(algo?: string): { toString(): string };
    toString(format?: string): string;
  }
  export function parseKey(data: string | Buffer, type?: string): Key;
  export function generateKeyPair(
    type: string,
    opts?: { bits?: number; curve?: string },
  ): { key: Key; privateKey: Key };
}

/**
 * @dotenvup/format — Passphrase-protected key export/import bundle
 *
 * This module exports/imports the keypair used by DotEnvUp as an encrypted
 * JSON bundle. Private key material is never serialized in plaintext.
 */

import type { Keypair } from './keyProvider.js';
import { randomBytes, scryptSync } from 'node:crypto';
import { initSodium, keyFingerprint } from './crypto.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sodium: any = null;

const KEY_BUNDLE_FORMAT = 'dotenvup-keybundle';
const KEY_BUNDLE_VERSION = 1;
const KDF_NAME = 'scrypt';
const CIPHER_NAME = 'xchacha20-poly1305';

export interface KeyBundleV1 {
  version: 1;
  format: typeof KEY_BUNDLE_FORMAT;
  createdAt: string;
  publicKey: string; // base64
  keyId: string;
  kdf: {
    name: typeof KDF_NAME;
    n: number;
    r: number;
    p: number;
    salt: string; // base64
  };
  cipher: {
    name: typeof CIPHER_NAME;
    nonce: string; // base64
    ciphertext: string; // base64 (aead output with tag)
  };
}

async function getSodium() {
  if (!sodium) {
    const lib = await import('libsodium-wrappers');
    await lib.ready;
    sodium = lib.default;
  }
  return sodium!;
}

function requirePassphrase(passphrase: string): string {
  const p = passphrase ?? '';
  if (p.length < 8) {
    throw new Error('Passphrase must be at least 8 characters.');
  }
  return p;
}

function uint8Equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function validateBundleShape(bundle: unknown): asserts bundle is KeyBundleV1 {
  if (!bundle || typeof bundle !== 'object') throw new Error('Invalid key bundle.');
  const b = bundle as Record<string, unknown>;
  if (b['version'] !== KEY_BUNDLE_VERSION) throw new Error('Unsupported key bundle version.');
  if (b['format'] !== KEY_BUNDLE_FORMAT) throw new Error('Invalid key bundle format.');
  if (typeof b['publicKey'] !== 'string' || typeof b['keyId'] !== 'string') {
    throw new Error('Invalid key bundle fields.');
  }

  const kdf = b['kdf'];
  if (!kdf || typeof kdf !== 'object') throw new Error('Invalid key bundle KDF block.');
  const kdfObj = kdf as Record<string, unknown>;
  if (
    kdfObj['name'] !== KDF_NAME ||
    typeof kdfObj['n'] !== 'number' ||
    typeof kdfObj['r'] !== 'number' ||
    typeof kdfObj['p'] !== 'number' ||
    typeof kdfObj['salt'] !== 'string'
  ) {
    throw new Error('Invalid key bundle KDF parameters.');
  }

  const cipher = b['cipher'];
  if (!cipher || typeof cipher !== 'object') throw new Error('Invalid key bundle cipher block.');
  const cipherObj = cipher as Record<string, unknown>;
  if (
    cipherObj['name'] !== CIPHER_NAME ||
    typeof cipherObj['nonce'] !== 'string' ||
    typeof cipherObj['ciphertext'] !== 'string'
  ) {
    throw new Error('Invalid key bundle cipher parameters.');
  }
}

/**
 * Export keypair to an encrypted key bundle.
 */
export async function exportKeyBundle(
  keypair: Keypair,
  passphrase: string,
): Promise<KeyBundleV1> {
  await initSodium();
  const s = await getSodium();
  const pw = requirePassphrase(passphrase);

  if (keypair.publicKey.length !== 32 || keypair.privateKey.length !== 32) {
    throw new Error('Keypair must contain 32-byte public and private keys.');
  }

  const n = 1 << 15;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const derivedKey = scryptSync(
    pw,
    salt,
    s.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
    { N: n, r, p, maxmem: 128 * 1024 * 1024 },
  );

  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    keypair.privateKey,
    null,
    null,
    nonce,
    derivedKey,
  );

  return {
    version: KEY_BUNDLE_VERSION,
    format: KEY_BUNDLE_FORMAT,
    createdAt: new Date().toISOString(),
    publicKey: s.to_base64(keypair.publicKey),
    keyId: await keyFingerprint(keypair.publicKey),
    kdf: {
      name: KDF_NAME,
      n,
      r,
      p,
      salt: Buffer.from(salt).toString('base64'),
    },
    cipher: {
      name: CIPHER_NAME,
      nonce: s.to_base64(nonce),
      ciphertext: s.to_base64(ciphertext),
    },
  };
}

/**
 * Import and decrypt keypair from an encrypted key bundle.
 */
export async function importKeyBundle(
  bundle: KeyBundleV1,
  passphrase: string,
): Promise<Keypair> {
  await initSodium();
  const s = await getSodium();
  const pw = requirePassphrase(passphrase);
  validateBundleShape(bundle);

  const salt = Buffer.from(bundle.kdf.salt, 'base64');
  const nonce = s.from_base64(bundle.cipher.nonce);
  const ciphertext = s.from_base64(bundle.cipher.ciphertext);
  const bundledPublicKey = s.from_base64(bundle.publicKey);

  const derivedKey = scryptSync(
    pw,
    salt,
    s.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
    { N: bundle.kdf.n, r: bundle.kdf.r, p: bundle.kdf.p, maxmem: 128 * 1024 * 1024 },
  );

  const privateKey = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    null,
    nonce,
    derivedKey,
  ) as Uint8Array | null;

  if (!privateKey || privateKey.length !== 32) {
    throw new Error('Failed to decrypt key bundle (wrong passphrase or corrupted file).');
  }
  if (bundledPublicKey.length !== 32) {
    throw new Error('Invalid public key in key bundle.');
  }

  const derivedPublicKey = s.crypto_scalarmult_base(privateKey) as Uint8Array;
  if (!uint8Equal(derivedPublicKey, bundledPublicKey)) {
    throw new Error('Key bundle integrity check failed (public/private key mismatch).');
  }

  const actualKeyId = await keyFingerprint(bundledPublicKey);
  if (actualKeyId !== bundle.keyId) {
    throw new Error('Key bundle integrity check failed (fingerprint mismatch).');
  }

  return {
    publicKey: bundledPublicKey,
    privateKey,
  };
}

export function parseKeyBundle(content: string): KeyBundleV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Key bundle is not valid JSON.');
  }
  validateBundleShape(parsed);
  return parsed;
}


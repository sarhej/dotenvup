/**
 * @dotenvup/cli — Key storage using shared KeyStore
 *
 * Uses the shared KeyProvider chain from @dotenvup/format:
 *   1. EnvProvider (UP_KEY env var) — for CI/CD, Docker, SSH
 *   2. FileProvider (~/.dotenvup/identity) — universal, cross-IDE
 *
 * The CLI and all VS Code-based IDEs (Cursor, VS Code, etc.) share
 * the same key at ~/.dotenvup/identity.
 */

import { KeyStore, FileProvider, keyFingerprint, type Keypair } from '@dotenvup/format';

const store = new KeyStore();

export async function storeKeypair(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
  await store.saveKeypair(publicKey, privateKey);
}

export async function getKeypair(): Promise<Keypair | null> {
  return store.getKeypair();
}

export async function getPrivateKey(): Promise<Uint8Array | null> {
  return store.getPrivateKey();
}

export async function getPublicKey(): Promise<Uint8Array | null> {
  return store.getPublicKey();
}

export async function hasKeypair(): Promise<boolean> {
  return store.hasKeypair();
}

/** Fingerprint of the stored public key (for Key-Id matching) */
export async function getKeyId(): Promise<string | null> {
  const pubKey = await getPublicKey();
  if (!pubKey) return null;
  return keyFingerprint(pubKey);
}

/** Get the path to the public key file */
export function getPublicKeyPath(): string {
  const fp = store.getProvider('file') as FileProvider | undefined;
  return fp?.getPublicKeyPath() ?? '~/.dotenvup/identity.pub';
}

export function getIdentityDir(): string {
  const fp = store.getProvider('file') as FileProvider | undefined;
  return fp?.getIdentityDir() ?? '~/.dotenvup';
}

/**
 * EnvProvider — reads keypair from UP_KEY / DOTENVUP_PRIVATE_KEY env var.
 *
 * Priority 1 (highest). Read-only. Used in CI/CD, Docker, SSH.
 * The env var contains a base64-encoded 32-byte X25519 private key.
 * The public key is derived from the private key via crypto_scalarmult_base.
 */

import type { KeyProvider, Keypair } from '../keyProvider.js';

export class EnvProvider implements KeyProvider {
  readonly name = 'env';
  readonly writable = false;

  async available(): Promise<boolean> {
    return !!(process.env.UP_KEY || process.env.DOTENVUP_PRIVATE_KEY);
  }

  async getKeypair(): Promise<Keypair | null> {
    const raw = process.env.UP_KEY || process.env.DOTENVUP_PRIVATE_KEY;
    if (!raw) return null;

    const privateKey = new Uint8Array(Buffer.from(raw, 'base64'));
    if (privateKey.length !== 32) return null;

    // Derive public key from private key
    const { initSodium } = await import('../crypto.js');
    await initSodium();
    const lib = await import('libsodium-wrappers');
    const publicKey = lib.default.crypto_scalarmult_base(privateKey);

    return { publicKey, privateKey };
  }

  async saveKeypair(_publicKey: Uint8Array, _privateKey: Uint8Array): Promise<void> {
    throw new Error('EnvProvider is read-only. Cannot save keypair to environment variable.');
  }
}

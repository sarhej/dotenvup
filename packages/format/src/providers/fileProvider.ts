/**
 * FileProvider — reads/writes keypair under ~/.dotenvup
 *
 * Priority 2. Universal fallback that works across all IDEs and CLI.
 *
 * Storage (M1+):
 *   ~/.dotenvup/identity.enc   — envelope (private key under wrapping key)
 *   ~/.dotenvup/wrapping-key   — 32-byte file wrapping key (mode 0o600)
 *   ~/.dotenvup/identity.pub   — base64 public key (mode 0o644)
 *
 * Legacy (still readable):
 *   ~/.dotenvup/identity       — plaintext base64 private key (mode 0o600)
 *
 * Safety: if identity.enc exists but cannot be opened, fall back to plaintext
 * so a failed migration never hides the only remaining key.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { KeyProvider, Keypair } from '../keyProvider.js';
import {
  loadKeypairEnvelope,
  PLAINTEXT_IDENTITY_FILE,
  PUBLIC_IDENTITY_FILE,
  saveKeypairEnvelope,
} from '../identityEnvelope.js';

export class FileProvider implements KeyProvider {
  readonly name = 'file';
  readonly writable = true;

  private dir: string;
  private privPath: string;
  private pubPath: string;

  constructor(customDir?: string) {
    const envDir = process.env.DOTENVUP_IDENTITY_DIR?.trim();
    const isTestEnv =
      process.env.DOTENVUP_TEST === '1' ||
      process.env.VITEST === 'true' ||
      process.env.NODE_ENV === 'test';
    const testDir = process.env.DOTENVUP_TEST_IDENTITY_DIR?.trim();
    const resolvedEnvDir = envDir && envDir.length > 0 ? path.resolve(envDir) : null;
    const resolvedTestDir = testDir && testDir.length > 0 ? path.resolve(testDir) : null;
    this.dir = customDir
      ?? resolvedEnvDir
      ?? (isTestEnv ? (resolvedTestDir ?? path.join(os.tmpdir(), 'dotenvup-test-identity', String(process.pid))) : path.join(os.homedir(), '.dotenvup'));
    this.privPath = path.join(this.dir, PLAINTEXT_IDENTITY_FILE);
    this.pubPath = path.join(this.dir, PUBLIC_IDENTITY_FILE);
  }

  async available(): Promise<boolean> {
    return true; // Filesystem is always available
  }

  async getKeypair(): Promise<Keypair | null> {
    // AuthCancelledError / NonInteractiveKeychainError propagate to the CLI.
    const fromEnvelope = await loadKeypairEnvelope(this.dir);
    if (fromEnvelope) return fromEnvelope;
    return this.loadPlaintextKeypair();
  }

  private async loadPlaintextKeypair(): Promise<Keypair | null> {
    try {
      const privRaw = await fs.readFile(this.privPath, 'utf-8');
      const pubRaw = await fs.readFile(this.pubPath, 'utf-8');

      const privateKey = new Uint8Array(Buffer.from(privRaw.trim(), 'base64'));
      const publicKey = new Uint8Array(Buffer.from(pubRaw.trim(), 'base64'));

      if (privateKey.length !== 32 || publicKey.length !== 32) return null;

      return { publicKey, privateKey };
    } catch {
      return null;
    }
  }

  async saveKeypair(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
    await saveKeypairEnvelope(this.dir, publicKey, privateKey);
  }

  /** Returns the path to the identity directory */
  getIdentityDir(): string {
    return this.dir;
  }

  /**
   * Legacy plaintext private key path (may be absent when using envelope).
   * Prefer detectKeyStorageMode / identity.enc for new code.
   */
  getPrivateKeyPath(): string {
    return this.privPath;
  }

  /** Returns the path to the public key file */
  getPublicKeyPath(): string {
    return this.pubPath;
  }

  /** Returns path to identity.enc when using envelope storage */
  getEnvelopePath(): string {
    return path.join(this.dir, 'identity.enc');
  }
}

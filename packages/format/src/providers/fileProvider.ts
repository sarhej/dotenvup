/**
 * FileProvider — reads/writes keypair to ~/.dotenvup/identity
 *
 * Priority 2. Universal fallback that works across all IDEs and CLI.
 * Uses the same model as ~/.ssh/ — filesystem permissions protect the key.
 *
 * Files:
 *   ~/.dotenvup/identity      — base64-encoded 32-byte private key (mode 0o600)
 *   ~/.dotenvup/identity.pub  — base64-encoded 32-byte public key (mode 0o644)
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { KeyProvider, Keypair } from '../keyProvider.js';

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
    this.privPath = path.join(this.dir, 'identity');
    this.pubPath = path.join(this.dir, 'identity.pub');
  }

  async available(): Promise<boolean> {
    return true; // Filesystem is always available
  }

  async getKeypair(): Promise<Keypair | null> {
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
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    await fs.writeFile(
      this.privPath,
      Buffer.from(privateKey).toString('base64') + '\n',
      { mode: 0o600 },
    );
    await fs.writeFile(
      this.pubPath,
      Buffer.from(publicKey).toString('base64') + '\n',
      { mode: 0o644 },
    );
  }

  /** Returns the path to the identity directory */
  getIdentityDir(): string {
    return this.dir;
  }

  /** Returns the path to the private key file */
  getPrivateKeyPath(): string {
    return this.privPath;
  }

  /** Returns the path to the public key file */
  getPublicKeyPath(): string {
    return this.pubPath;
  }
}

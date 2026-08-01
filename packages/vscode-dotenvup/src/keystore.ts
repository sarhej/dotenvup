/**
 * DotEnvUp — Extension KeyStore
 *
 * Wraps the shared KeyStore from @dotenvup/format and adds:
 * 1. LegacyVSCodeProvider — reads from context.secrets for migration
 * 2. Auto-migration: legacy keys are moved to ~/.dotenvup/identity on first use
 *
 * After migration, context.secrets is never used for key storage again.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ExtensionContext } from 'vscode';
import type { KeyProvider, Keypair } from '@dotenvup/format';
import {
  KeyStore,
  EnvProvider,
  FileProvider,
  detectKeyStorageMode,
  PUBLIC_IDENTITY_FILE,
  IDENTITY_ENVELOPE_FILE,
  PLAINTEXT_IDENTITY_FILE,
} from '@dotenvup/format';
import { KEYCHAIN_NO_KEY_HINT } from './keyErrors';

const LEGACY_KEY_ACCOUNT = 'dotenvup-local-keypair';

/**
 * LegacyVSCodeProvider — reads keypair from VS Code SecretStorage.
 * Used only for migration from the old storage. Lowest priority.
 */
class LegacyVSCodeProvider implements KeyProvider {
  readonly name = 'legacy-vscode';
  readonly writable = false;

  constructor(private context: ExtensionContext) {}

  async available(): Promise<boolean> {
    return true;
  }

  async getKeypair(): Promise<Keypair | null> {
    const stored = await this.context.secrets.get(LEGACY_KEY_ACCOUNT);
    if (!stored) return null;
    try {
      const data = JSON.parse(stored);
      return {
        publicKey: new Uint8Array(Buffer.from(data.publicKey, 'base64')),
        privateKey: new Uint8Array(Buffer.from(data.privateKey, 'base64')),
      };
    } catch {
      return null;
    }
  }

  async saveKeypair(): Promise<void> {
    throw new Error('LegacyVSCodeProvider is read-only. Use FileProvider instead.');
  }
}

/**
 * ExtensionKeyStore — the extension's key management facade.
 *
 * Provider chain: EnvProvider → FileProvider → LegacyVSCodeProvider
 * On first access, if a legacy key is found, it's migrated to FileProvider
 * and deleted from context.secrets.
 */
export class ExtensionKeyStore {
  private store: KeyStore;
  private context: ExtensionContext;
  private migrated = false;

  constructor(context: ExtensionContext) {
    this.context = context;
    this.store = new KeyStore([
      new EnvProvider(),
      new FileProvider(),
      new LegacyVSCodeProvider(context),
    ]);
  }

  /**
   * Run migration once: if legacy key exists but FileProvider has no key,
   * copy the legacy key to FileProvider and delete from context.secrets.
   * Must not require Keychain decrypt (cold keychain would prompt/fail).
   */
  private async ensureMigrated(): Promise<void> {
    if (this.migrated) return;
    this.migrated = true;

    const fileProvider = this.store.getProvider('file') as FileProvider | undefined;
    if (!fileProvider) return;

    const dir = fileProvider.getIdentityDir();
    // Identity already on disk (envelope, keychain, or plaintext) — skip legacy migrate.
    try {
      const mode = await detectKeyStorageMode(dir);
      if (mode !== 'absent') return;
    } catch {
      // continue
    }
    if (
      fs.existsSync(path.join(dir, IDENTITY_ENVELOPE_FILE)) ||
      fs.existsSync(path.join(dir, PLAINTEXT_IDENTITY_FILE)) ||
      fs.existsSync(path.join(dir, PUBLIC_IDENTITY_FILE))
    ) {
      return;
    }

    const legacyProvider = this.store.getProvider('legacy-vscode');
    if (!legacyProvider) return;

    const legacyKey = await legacyProvider.getKeypair();
    if (!legacyKey) return;

    await fileProvider.saveKeypair(legacyKey.publicKey, legacyKey.privateKey);
    await this.context.secrets.delete(LEGACY_KEY_ACCOUNT);
    await this.context.globalState.update('dotenvup-publicKey', undefined);
  }

  /** True if any identity material exists (does not require Touch ID). */
  async hasKeypair(): Promise<boolean> {
    await this.ensureMigrated();
    try {
      const mode = await detectKeyStorageMode(this.getIdentityDir());
      if (mode !== 'absent') return true;
    } catch {
      // fall through
    }
    if (fs.existsSync(path.join(this.getIdentityDir(), PUBLIC_IDENTITY_FILE))) return true;
    try {
      return await this.store.hasKeypair();
    } catch {
      return true; // keychain cold / cancel — still configured
    }
  }

  async getPublicKey(): Promise<Uint8Array | null> {
    await this.ensureMigrated();
    const pubPath = path.join(this.getIdentityDir(), PUBLIC_IDENTITY_FILE);
    try {
      if (fs.existsSync(pubPath)) {
        const pub = new Uint8Array(Buffer.from(fs.readFileSync(pubPath, 'utf8').trim(), 'base64'));
        if (pub.length === 32) return pub;
      }
    } catch {
      // fall through
    }
    return this.store.getPublicKey();
  }

  async getPrivateKey(): Promise<Uint8Array | null> {
    await this.ensureMigrated();
    try {
      return await this.store.getPrivateKey();
    } catch (err) {
      // Re-throw cancel / non-interactive so unlock can show the right toast.
      throw err;
    }
  }

  /**
   * Load private key or throw a clear Error (never silent null for keychain).
   */
  async requirePrivateKey(): Promise<Uint8Array> {
    await this.ensureMigrated();
    let mode: string = 'absent';
    try {
      mode = await detectKeyStorageMode(this.getIdentityDir());
    } catch {
      // ignore
    }

    try {
      const key = await this.store.getPrivateKey();
      if (key) return key;
    } catch (err) {
      throw err;
    }

    if (mode === 'keychain' || fs.existsSync(path.join(this.getIdentityDir(), IDENTITY_ENVELOPE_FILE))) {
      throw new Error(KEYCHAIN_NO_KEY_HINT);
    }
    throw new Error('DotEnvUp: No keypair. Run "DotEnvUp: Init" first.');
  }

  async storeKeypair(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
    await this.ensureMigrated();
    await this.store.saveKeypair(publicKey, privateKey);
  }

  /** Get the underlying KeyStore (for advanced operations) */
  getKeyStore(): KeyStore {
    return this.store;
  }

  /** Get the FileProvider's identity directory path */
  getIdentityDir(): string {
    const fp = this.store.getProvider('file') as FileProvider | undefined;
    return fp?.getIdentityDir() ?? '~/.dotenvup';
  }
}

/**
 * DotEnvUp — Extension KeyStore
 *
 * Wraps the shared KeyStore from @dotenvup/format and adds:
 * 1. LegacyVSCodeProvider — reads from context.secrets for migration
 * 2. Auto-migration: legacy keys are moved to ~/.dotenvup/identity on first use
 *
 * After migration, context.secrets is never used for key storage again.
 */

import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import type { KeyProvider, Keypair } from '@dotenvup/format';
import { KeyStore, EnvProvider, FileProvider } from '@dotenvup/format';

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
   */
  private async ensureMigrated(): Promise<void> {
    if (this.migrated) return;
    this.migrated = true;

    const fileProvider = this.store.getProvider('file') as FileProvider | undefined;
    if (!fileProvider) return;

    // Check if FileProvider already has a key
    const fileKey = await fileProvider.getKeypair();
    if (fileKey) return; // Already migrated or user set up manually

    // Check if legacy key exists
    const legacyProvider = this.store.getProvider('legacy-vscode');
    if (!legacyProvider) return;

    const legacyKey = await legacyProvider.getKeypair();
    if (!legacyKey) return;

    // Migrate: copy to FileProvider
    await fileProvider.saveKeypair(legacyKey.publicKey, legacyKey.privateKey);

    // Delete from legacy store
    await this.context.secrets.delete(LEGACY_KEY_ACCOUNT);
    await this.context.globalState.update('dotenvup-publicKey', undefined);
  }

  async hasKeypair(): Promise<boolean> {
    await this.ensureMigrated();
    return this.store.hasKeypair();
  }

  async getPublicKey(): Promise<Uint8Array | null> {
    await this.ensureMigrated();
    return this.store.getPublicKey();
  }

  async getPrivateKey(): Promise<Uint8Array | null> {
    await this.ensureMigrated();
    return this.store.getPrivateKey();
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

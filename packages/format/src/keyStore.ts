/**
 * @dotenvup/format — KeyStore (priority chain)
 *
 * Chains multiple KeyProvider implementations in priority order.
 * Default chain: EnvProvider → FileProvider
 *
 * The extension and CLI can inject additional providers (e.g. LegacyVSCodeProvider).
 */

import type { KeyProvider, Keypair } from './keyProvider.js';
import { EnvProvider } from './providers/envProvider.js';
import { FileProvider } from './providers/fileProvider.js';

export class KeyStore {
  private providers: KeyProvider[];

  /**
   * Create a KeyStore with the given providers.
   * If no providers are given, uses the default chain: EnvProvider → FileProvider.
   */
  constructor(providers?: KeyProvider[]) {
    this.providers = providers ?? [new EnvProvider(), new FileProvider()];
  }

  /** Try each provider in order until one returns a keypair */
  async getKeypair(): Promise<Keypair | null> {
    for (const provider of this.providers) {
      if (await provider.available()) {
        const kp = await provider.getKeypair();
        if (kp) return kp;
      }
    }
    return null;
  }

  /** Get only the public key */
  async getPublicKey(): Promise<Uint8Array | null> {
    const kp = await this.getKeypair();
    return kp?.publicKey ?? null;
  }

  /** Get only the private key */
  async getPrivateKey(): Promise<Uint8Array | null> {
    const kp = await this.getKeypair();
    return kp?.privateKey ?? null;
  }

  /** Check if any provider has a keypair */
  async hasKeypair(): Promise<boolean> {
    const kp = await this.getKeypair();
    return kp !== null;
  }

  /**
   * Save a keypair to ALL writable providers for redundancy.
   * Skips read-only providers (e.g. EnvProvider).
   */
  async saveKeypair(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
    let saved = false;
    for (const provider of this.providers) {
      if (provider.writable && (await provider.available())) {
        try {
          await provider.saveKeypair(publicKey, privateKey);
          saved = true;
        } catch {
          // Skip providers that fail to save
        }
      }
    }
    if (!saved) {
      throw new Error('No writable key provider available. Cannot save keypair.');
    }
  }

  /**
   * Store a keypair to a specific provider by name.
   * Used during migration to write to a specific target.
   */
  async saveKeypairTo(providerName: string, publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
    const provider = this.providers.find((p) => p.name === providerName);
    if (!provider) throw new Error(`Provider "${providerName}" not found`);
    if (!provider.writable) throw new Error(`Provider "${providerName}" is read-only`);
    await provider.saveKeypair(publicKey, privateKey);
  }

  /** Get a provider by name */
  getProvider(name: string): KeyProvider | undefined {
    return this.providers.find((p) => p.name === name);
  }

  /** Get all providers in priority order */
  getProviders(): readonly KeyProvider[] {
    return this.providers;
  }
}

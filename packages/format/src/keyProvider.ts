/**
 * @dotenvup/format — KeyProvider interface
 *
 * Abstraction for key storage backends. Used by KeyStore to chain
 * multiple providers in priority order (env var → file → legacy).
 */

export interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface KeyProvider {
  /** Human-readable name for logging/debugging */
  readonly name: string;

  /** Whether this provider is available in the current environment */
  available(): Promise<boolean>;

  /** Read the stored keypair, or null if none exists */
  getKeypair(): Promise<Keypair | null>;

  /**
   * Save a keypair. Throws if the provider is read-only (e.g. EnvProvider).
   * @returns true if saved successfully
   */
  saveKeypair(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void>;

  /** Whether this provider supports writing (false for env var provider) */
  readonly writable: boolean;
}

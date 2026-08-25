/**
 * @dotenvup/format — Type definitions
 */

export interface EnvUpKey {
  /** The environment variable name (e.g. "DB_PASSWORD") */
  name: string;
  /** Version number (increments on each change) */
  version: number;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  /** Author who last changed this key (e.g. "@alice") */
  author: string;
  /** Optional human-readable note */
  note?: string;
  /** Optional environment tag (e.g. "dev", "staging", "prod") */
  env?: string;
}

export interface EnvUpHeader {
  /** Format version (e.g. 1) */
  formatVersion: number;
  /** Who encrypted this file */
  encryptedBy: string;
  /** Who can decrypt this file */
  encryptedFor: string[];
  /** Key fingerprint of primary recipient (skip decrypt if key does not match local identity) */
  keyId?: string;
  /** ISO 8601 timestamp of file creation */
  createdAt: string;
  /** Encryption algorithm identifier */
  algorithm: string;
  /** Optional comment/blank lines from original .env (header, section groupings) for use as example */
  structureComments?: string[];
  /** List of keys with metadata */
  keys: EnvUpKey[];
}

export interface EnvUpRecipientBlock {
  /** Recipient identifier (e.g. "@local", "@bob") */
  recipient: string;
  /** Encryption nonce (base64) */
  nonce: string;
  /** Ephemeral public key used for hybrid encryption (base64) */
  ephemeral: string;
  /** Encrypted payload (base64) */
  payload: string;
}

export interface EnvUpPolicyRow {
  recipient: string;
  keys: string[];
}

export interface EnvUpPolicy {
  version: number;
  rows: EnvUpPolicyRow[];
}

export interface EnvUpFile {
  /** Cleartext header with metadata */
  header: EnvUpHeader;
  /** Optional per-recipient value ACL (cleartext) */
  policy?: EnvUpPolicy;
  /** Signature over the header (V2, not used in V1) */
  signature?: {
    headerHash: string;
    signedBy: string;
    signature: string;
  };
  /** Encrypted blocks, one per recipient */
  encryptedBlocks: EnvUpRecipientBlock[];
}

/** Header + decrypted key-value map (result of decrypt) */
export interface EnvUpDecryptedFile {
  header: EnvUpHeader;
  entries: Record<string, string>;
}

/** Custom error for parse failures */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number,
  ) {
    super(message);
    this.name = 'ParseError';
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

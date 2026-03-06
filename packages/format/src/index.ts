/**
 * @dotenvup/format
 *
 * Core parser and writer for the .env.up encrypted environment file format.
 *
 * The .env.up format is an encrypted .env file with visible metadata:
 * - Cleartext header: key names, versions, timestamps, author
 * - Encrypted payload: actual secret values (per-recipient)
 */

export {
  type EnvUpKey,
  type EnvUpHeader,
  type EnvUpRecipientBlock,
  type EnvUpFile,
  type EnvUpDecryptedFile,
  ParseError,
} from './types.js';

export { FORMAT_MAGIC, FORMAT_VERSION, DEFAULT_ALGORITHM, DEFAULT_RECIPIENT } from './constants.js';

export { parseHeader, parse } from './parser.js';
export { serialize, serializeHeader } from './serializer.js';

export { parseEnvFile, extractStructureComments, entriesMatch, entriesDiff } from './envParser.js';

export { generateKeypair, encrypt, initSodium, keyFingerprint, type DecryptResult } from './crypto.js';

// Safe deletion guard
export { isSafeToDelete, type SafeDeleteResult } from './safeDelete.js';

// Key storage
export { type KeyProvider, type Keypair } from './keyProvider.js';
export { KeyStore } from './keyStore.js';
export { EnvProvider } from './providers/envProvider.js';
export { FileProvider } from './providers/fileProvider.js';
export {
  type KeyBundleV1,
  exportKeyBundle,
  importKeyBundle,
  parseKeyBundle,
} from './keyBundle.js';
export {
  searchLocalKeys,
  discoverLocalKeyCandidates,
  type KeySearchMatch,
  type KeySearchOptions,
  type KeySearchSummary,
} from './keySearch.js';
export {
  RECIPIENTS_FILE,
  type RecipientConfigEntry,
  readRecipientsConfig,
  writeRecipientsConfig,
  addRecipient,
  removeRecipient,
  resolveRecipientPublicKeys,
} from './recipientsConfig.js';

// SSH key utilities (Ed25519 → X25519 conversion for GitHub key-based encryption)
export {
  parseSshEd25519,
  ed25519PubToX25519,
  ed25519SecretToX25519,
  fetchGitHubSshKeys,
  fetchGitHubX25519Keys,
} from './sshKeys.js';

// Sealed share (Approach B: true recipient encryption via crypto_box_seal)
export { sealedShareEncrypt, sealedShareDecrypt } from './sealedShare.js';

/**
 * Decrypt the values for a specific recipient from an EnvUpFile.
 * Returns entries (key-value pairs) and optionally the raw .env content.
 */
export async function decrypt(
  file: import('./types.js').EnvUpFile,
  recipientId: string,
  privateKey: Uint8Array,
): Promise<import('./crypto.js').DecryptResult> {
  const { decrypt: decryptBlock } = await import('./crypto.js');
  const block = file.encryptedBlocks.find((b) => b.recipient === recipientId);
  if (!block) {
    throw new Error(`No encrypted block for recipient "${recipientId}"`);
  }
  return decryptBlock(block, privateKey);
}

/**
 * Decrypt using any recipient block that matches the provided private key.
 * Tries preferred recipient first (default @local), then all remaining blocks.
 */
export async function decryptAny(
  file: import('./types.js').EnvUpFile,
  privateKey: Uint8Array,
  preferredRecipient = '@local',
): Promise<import('./crypto.js').DecryptResult & { recipient: string }> {
  const { decrypt: decryptBlock } = await import('./crypto.js');
  const tried = new Set<string>();
  const ordered = file.encryptedBlocks
    .slice()
    .sort((a, b) => (a.recipient === preferredRecipient ? -1 : b.recipient === preferredRecipient ? 1 : 0));

  let lastError: unknown = null;
  for (const block of ordered) {
    if (tried.has(block.recipient)) continue;
    tried.add(block.recipient);
    try {
      const dec = await decryptBlock(block, privateKey);
      return { ...dec, recipient: block.recipient };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `No recipient block could be decrypted with the current key${
      lastError ? ` (${lastError instanceof Error ? lastError.message : String(lastError)})` : ''
    }`,
  );
}

/**
 * Create a new .env.up file from plain key-value entries.
 * Encrypts values for the specified recipients.
 *
 * When rawContent is provided, the original .env text (including comments,
 * blank lines, and ordering) is encrypted alongside the parsed entries.
 * On decrypt, callers receive both entries and the raw content.
 */
export async function create(
  entries: Record<string, string>,
  author: string,
  recipientPublicKeys: Map<string, Uint8Array>,
  rawContent?: string,
): Promise<import('./types.js').EnvUpFile> {
  const crypto = await import('./crypto.js');
  await crypto.initSodium();

  const now = new Date().toISOString();
  const keys = Object.keys(entries).map((name) => ({
    name,
    version: 1,
    updatedAt: now,
    author,
  }));

  const primaryRecipient = recipientPublicKeys.keys().next().value;
  const primaryPubKey = primaryRecipient ? recipientPublicKeys.get(primaryRecipient) : undefined;
  const keyId = primaryPubKey ? await crypto.keyFingerprint(primaryPubKey) : undefined;

  const { extractStructureComments } = await import('./envParser.js');
  const structureComments =
    rawContent && rawContent.trim().length > 0 ? extractStructureComments(rawContent) : undefined;

  const header: import('./types.js').EnvUpHeader = {
    formatVersion: 1,
    encryptedBy: author,
    encryptedFor: Array.from(recipientPublicKeys.keys()),
    keyId,
    createdAt: now,
    algorithm: 'x25519-xchacha20-poly1305',
    structureComments: structureComments?.length ? structureComments : undefined,
    keys,
  };

  const encryptedBlocks = await crypto.encrypt(entries, recipientPublicKeys, rawContent);

  const file: import('./types.js').EnvUpFile = {
    header,
    encryptedBlocks,
  };

  return file;
}

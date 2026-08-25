/**
 * @dotenvup/format — Crypto (X25519 + XChaCha20-Poly1305 via libsodium)
 *
 * Hybrid encryption:
 * - Symmetric: random key + XChaCha20-Poly1305 (secretbox) for payload
 * - Per-recipient: crypto_box_seal to wrap the symmetric key
 */

import type { EnvUpPolicy, EnvUpRecipientBlock } from './types.js';
import {
  assertPolicyWritable,
  filterEntries,
  filterRawForKeys,
  policyKeySetForRecipient,
} from './policy.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sodium: any = null;

const SEAL_OVERHEAD = 48; // crypto_box_SEALBYTES
const EPHEMERAL_PK_BYTES = 32; // crypto_box_PUBLICKEYBYTES
const SECRETBOX_NONCE_BYTES = 24;
const SYMMETRIC_KEY_BYTES = 32;

async function getSodium() {
  if (!sodium) {
    const lib = await import('libsodium-wrappers');
    await lib.ready;
    sodium = lib.default;
  }
  return sodium!;
}

export async function initSodium(): Promise<void> {
  await getSodium();
}

export async function generateKeypair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  const s = await getSodium();
  const kp = s.crypto_box_keypair();
  return {
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
  };
}

/** Compute a short fingerprint of a public key (8 bytes BLAKE2b → base64url, 12 chars) */
export async function keyFingerprint(publicKey: Uint8Array): Promise<string> {
  const s = await getSodium();
  const hash = s.crypto_generichash(8, publicKey);
  return s.to_base64(hash, s.base64_variants.URLSAFE_NO_PADDING).slice(0, 12);
}

/**
 * Encrypt entries for multiple recipients.
 * Uses hybrid encryption: symmetric key encrypts payload, box_seal wraps key per recipient.
 *
 * When rawContent is provided, it is stored alongside entries as `_raw` in the
 * encrypted payload. On decrypt, callers can use `_raw` to reconstruct the
 * original .env file with comments, blank lines, and ordering intact.
 */
export async function encrypt(
  entries: Record<string, string>,
  recipientPublicKeys: Map<string, Uint8Array>,
  rawContent?: string,
  policy?: EnvUpPolicy,
): Promise<EnvUpRecipientBlock[]> {
  if (policy) {
    assertPolicyWritable(policy);
    const blocks: EnvUpRecipientBlock[] = [];
    for (const row of policy.rows) {
      const pubKey = recipientPublicKeys.get(row.recipient);
      if (!pubKey) {
        throw new Error(`Missing public key for policy recipient "${row.recipient}"`);
      }
      const allowed = new Set(row.keys);
      const filteredEntries = filterEntries(entries, allowed);
      const filteredRaw = filterRawForKeys(rawContent, allowed);
      blocks.push(
        await encryptRecipientBlock(row.recipient, pubKey, filteredEntries, filteredRaw),
      );
    }
    return blocks;
  }

  return encryptLegacySharedPayload(entries, recipientPublicKeys, rawContent);
}

export async function encryptRecipientBlock(
  recipient: string,
  pubKey: Uint8Array,
  entries: Record<string, string>,
  rawContent?: string,
): Promise<EnvUpRecipientBlock> {
  const s = await getSodium();

  const payload: Record<string, string> = { ...entries };
  if (rawContent !== undefined) {
    payload._raw = rawContent;
  }
  const payloadPlaintext = JSON.stringify(payload);

  const symmetricKey = s.randombytes_buf(SYMMETRIC_KEY_BYTES);
  const nonce = s.randombytes_buf(SECRETBOX_NONCE_BYTES);
  const payloadCiphertext = s.crypto_secretbox_easy(payloadPlaintext, nonce, symmetricKey);
  const sealedKey = s.crypto_box_seal(symmetricKey, pubKey);
  const ephemeralPk = sealedKey.slice(0, EPHEMERAL_PK_BYTES);

  const combinedPayload = new Uint8Array(sealedKey.length + payloadCiphertext.length);
  combinedPayload.set(sealedKey);
  combinedPayload.set(payloadCiphertext, sealedKey.length);

  return {
    recipient,
    nonce: s.to_base64(nonce),
    ephemeral: s.to_base64(ephemeralPk),
    payload: s.to_base64(combinedPayload),
  };
}

/** Legacy: one payload sealed for every recipient (same ciphertext). */
async function encryptLegacySharedPayload(
  entries: Record<string, string>,
  recipientPublicKeys: Map<string, Uint8Array>,
  rawContent?: string,
): Promise<EnvUpRecipientBlock[]> {
  const s = await getSodium();

  const payload: Record<string, string> = { ...entries };
  if (rawContent !== undefined) {
    payload._raw = rawContent;
  }
  const payloadPlaintext = JSON.stringify(payload);

  const symmetricKey = s.randombytes_buf(SYMMETRIC_KEY_BYTES);
  const nonce = s.randombytes_buf(SECRETBOX_NONCE_BYTES);

  const payloadCiphertext = s.crypto_secretbox_easy(
    payloadPlaintext,
    nonce,
    symmetricKey,
  );

  const blocks: EnvUpRecipientBlock[] = [];

  for (const [recipient, pubKey] of recipientPublicKeys) {
    const sealedKey = s.crypto_box_seal(symmetricKey, pubKey);
    const ephemeralPk = sealedKey.slice(0, EPHEMERAL_PK_BYTES);

    const combinedPayload = new Uint8Array(sealedKey.length + payloadCiphertext.length);
    combinedPayload.set(sealedKey);
    combinedPayload.set(payloadCiphertext, sealedKey.length);

    blocks.push({
      recipient,
      nonce: s.to_base64(nonce),
      ephemeral: s.to_base64(ephemeralPk),
      payload: s.to_base64(combinedPayload),
    });
  }

  return blocks;
}

/** @internal Exported for tests — build per-recipient payload from policy slice. */
export function buildRecipientPayload(
  entries: Record<string, string>,
  rawContent: string | undefined,
  recipientId: string,
  policy: EnvUpPolicy,
): { entries: Record<string, string>; raw?: string } {
  const allowed = policyKeySetForRecipient(policy, recipientId);
  if (!allowed) {
    throw new Error(`No policy row for recipient "${recipientId}"`);
  }
  const filteredEntries = filterEntries(entries, allowed);
  const filteredRaw = filterRawForKeys(rawContent, allowed);
  return { entries: filteredEntries, raw: filteredRaw };
}

export interface DecryptResult {
  entries: Record<string, string>;
  /** Original .env content with comments/structure, if stored during encryption */
  raw?: string;
}

/**
 * Decrypt a recipient block with the private key.
 * Returns entries and optionally the raw .env content (if `_raw` was stored).
 */
export async function decrypt(
  block: EnvUpRecipientBlock,
  privateKey: Uint8Array,
): Promise<DecryptResult> {
  const s = await getSodium();

  const nonce = s.from_base64(block.nonce);
  const payloadBytes = s.from_base64(block.payload);

  // First 80 bytes = seal output (32 ephemeral + 48 ciphertext)
  const sealedKeyLen = EPHEMERAL_PK_BYTES + SEAL_OVERHEAD;
  const sealedKey = payloadBytes.slice(0, sealedKeyLen);
  const secretboxCiphertext = payloadBytes.slice(sealedKeyLen);

  // Derive recipient's public key from private key
  const publicKey = s.crypto_scalarmult_base(privateKey);

  // Unseal to get symmetric key
  const symmetricKey = s.crypto_box_seal_open(sealedKey, publicKey, privateKey);

  // Decrypt payload
  const plaintext = s.crypto_secretbox_open_easy(
    secretboxCiphertext,
    nonce,
    symmetricKey,
  );

  const json = new TextDecoder().decode(plaintext);
  const parsed = JSON.parse(json) as Record<string, string>;

  const raw = parsed._raw;
  const entries = { ...parsed };
  delete entries._raw;

  return { entries, raw };
}

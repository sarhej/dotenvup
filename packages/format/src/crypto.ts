/**
 * @dotenvup/format — Crypto (X25519 + XChaCha20-Poly1305 via libsodium)
 *
 * Hybrid encryption:
 * - Symmetric: random key + XChaCha20-Poly1305 (secretbox) for payload
 * - Per-recipient: crypto_box_seal to wrap the symmetric key
 */

import type { EnvUpRecipientBlock } from './types.js';

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
): Promise<EnvUpRecipientBlock[]> {
  const s = await getSodium();

  const payload: Record<string, string> = { ...entries };
  if (rawContent !== undefined) {
    payload._raw = rawContent;
  }
  const payloadPlaintext = JSON.stringify(payload);

  // Generate symmetric key and nonce for secretbox
  const symmetricKey = s.randombytes_buf(SYMMETRIC_KEY_BYTES);
  const nonce = s.randombytes_buf(SECRETBOX_NONCE_BYTES);

  // Encrypt payload with symmetric key
  const payloadCiphertext = s.crypto_secretbox_easy(
    payloadPlaintext,
    nonce,
    symmetricKey,
  );

  const blocks: EnvUpRecipientBlock[] = [];

  for (const [recipient, pubKey] of recipientPublicKeys) {
    // Seal the symmetric key for this recipient (box_seal outputs: ephemeral_pk || ciphertext)
    const sealedKey = s.crypto_box_seal(symmetricKey, pubKey);

    // sealedKey: first 32 bytes = ephemeral public key, rest = encrypted symmetric key
    const ephemeralPk = sealedKey.slice(0, EPHEMERAL_PK_BYTES);
    const sealedCiphertext = sealedKey.slice(EPHEMERAL_PK_BYTES);

    // Combined payload: sealed_key_output (80 bytes) + secretbox_output
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

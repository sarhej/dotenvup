/**
 * @dotenvup/format — Sealed Share (Approach B: true recipient encryption)
 *
 * Encrypt a share payload to a recipient's X25519 public key using
 * libsodium crypto_box_seal. Only the holder of the corresponding
 * private key can decrypt. No shared secret or URL-embedded key needed.
 *
 * Uses the same libsodium instance as the main .env.up crypto module.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sodium: any = null;

async function getSodium() {
  if (!sodium) {
    const lib = await import('libsodium-wrappers');
    await lib.ready;
    sodium = lib.default;
  }
  return sodium!;
}

/**
 * Encrypt plaintext for a recipient identified by their X25519 public key.
 * Returns base64url-encoded ciphertext.
 *
 * Internally uses crypto_box_seal which generates an ephemeral keypair,
 * performs X25519 DH, and encrypts with XSalsa20-Poly1305.
 * Only the recipient's private key can decrypt.
 */
export async function sealedShareEncrypt(
  plaintext: string,
  recipientX25519Pub: Uint8Array,
): Promise<string> {
  const s = await getSodium();
  const encoded = new TextEncoder().encode(plaintext);
  const sealed = s.crypto_box_seal(encoded, recipientX25519Pub);
  return s.to_base64(sealed, s.base64_variants.URLSAFE_NO_PADDING);
}

/**
 * Decrypt a sealed share using the recipient's X25519 keypair.
 * Input is base64url-encoded ciphertext from sealedShareEncrypt.
 */
export async function sealedShareDecrypt(
  ciphertext: string,
  x25519Pub: Uint8Array,
  x25519Secret: Uint8Array,
): Promise<string> {
  const s = await getSodium();
  const sealed = s.from_base64(ciphertext, s.base64_variants.URLSAFE_NO_PADDING);
  const plaintext = s.crypto_box_seal_open(sealed, x25519Pub, x25519Secret);
  return new TextDecoder().decode(plaintext);
}

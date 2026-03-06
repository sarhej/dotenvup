import { describe, it, expect } from 'vitest';
import { generateKeypair, sealedShareEncrypt, sealedShareDecrypt } from '../index.js';

describe('sealedShare', () => {
  it('encrypts and decrypts for the intended recipient', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const plaintext = 'DB_PASSWORD=super-secret\nAPI_KEY=test-key\n';

    const ciphertext = await sealedShareEncrypt(plaintext, publicKey);
    const decrypted = await sealedShareDecrypt(ciphertext, publicKey, privateKey);

    expect(decrypted).toBe(plaintext);
  });

  it('fails to decrypt with the wrong keypair', async () => {
    const recipient = await generateKeypair();
    const other = await generateKeypair();

    const ciphertext = await sealedShareEncrypt('SECRET=value', recipient.publicKey);

    await expect(
      sealedShareDecrypt(ciphertext, other.publicKey, other.privateKey),
    ).rejects.toThrow();
  });

  it('uses randomized ciphertext for the same plaintext', async () => {
    const { publicKey } = await generateKeypair();

    const c1 = await sealedShareEncrypt('SAME=payload', publicKey);
    const c2 = await sealedShareEncrypt('SAME=payload', publicKey);

    expect(c1).not.toBe(c2);
    expect(/^[A-Za-z0-9_-]+$/.test(c1)).toBe(true);
    expect(/^[A-Za-z0-9_-]+$/.test(c2)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  generateKeypair,
  exportKeyBundle,
  importKeyBundle,
  parseKeyBundle,
  keyFingerprint,
} from '../index.js';

describe('key bundle', () => {
  it('exports and imports a keypair roundtrip', async () => {
    const kp = await generateKeypair();
    const bundle = await exportKeyBundle(kp, 'correct horse battery staple');
    const imported = await importKeyBundle(bundle, 'correct horse battery staple');

    expect(Buffer.from(imported.publicKey).toString('base64')).toBe(Buffer.from(kp.publicKey).toString('base64'));
    expect(Buffer.from(imported.privateKey).toString('base64')).toBe(Buffer.from(kp.privateKey).toString('base64'));
    expect(bundle.keyId).toBe(await keyFingerprint(imported.publicKey));
  });

  it('rejects wrong passphrase', async () => {
    const kp = await generateKeypair();
    const bundle = await exportKeyBundle(kp, 'correct horse battery staple');

    await expect(importKeyBundle(bundle, 'totally wrong passphrase')).rejects.toThrow(
      /wrong passphrase|corrupted|cannot be decrypted/i,
    );
  });

  it('rejects tampered ciphertext', async () => {
    const kp = await generateKeypair();
    const bundle = await exportKeyBundle(kp, 'correct horse battery staple');
    const mutated = {
      ...bundle,
      cipher: {
        ...bundle.cipher,
        ciphertext: bundle.cipher.ciphertext.slice(0, -2) + (bundle.cipher.ciphertext.endsWith('A') ? 'B' : 'A'),
      },
    };

    await expect(importKeyBundle(mutated, 'correct horse battery staple')).rejects.toThrow();
  });

  it('parseKeyBundle validates JSON shape', () => {
    expect(() => parseKeyBundle('not json')).toThrow(/not valid JSON/i);
    expect(() =>
      parseKeyBundle(
        JSON.stringify({
          version: 999,
          format: 'dotenvup-keybundle',
        }),
      ),
    ).toThrow(/Unsupported key bundle version/i);
  });
});


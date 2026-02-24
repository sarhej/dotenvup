import { describe, it, expect } from 'vitest';
import { generateKeypair, encrypt, decrypt, decryptAny, create, keyFingerprint } from '../index.js';

function makeFile(blocks: { recipient: string; nonce: string; ephemeral: string; payload: string }[]) {
  return {
    header: { formatVersion: 1, encryptedBy: '@local', encryptedFor: ['@local'], createdAt: '', algorithm: '', keys: [] },
    encryptedBlocks: blocks,
  };
}

describe('crypto', () => {
  it('generateKeypair returns valid keys', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(privateKey).toBeInstanceOf(Uint8Array);
    expect(publicKey.length).toBe(32);
    expect(privateKey.length).toBe(32);
  });

  it('encrypt and decrypt roundtrip', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const entries = { DB_HOST: 'localhost', DB_PASSWORD: 'secret123', API_KEY: 'test-key' };
    const recipientPublicKeys = new Map([['@local', publicKey]]);

    const blocks = await encrypt(entries, recipientPublicKeys);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].recipient).toBe('@local');
    expect(blocks[0].nonce).toBeTruthy();
    expect(blocks[0].ephemeral).toBeTruthy();
    expect(blocks[0].payload).toBeTruthy();

    const file = makeFile(blocks);
    const result = await decrypt(file, '@local', privateKey);
    expect(result.entries).toEqual(entries);
    expect(result.raw).toBeUndefined();
  });

  it('decrypt with wrong key fails', async () => {
    const { publicKey } = await generateKeypair();
    const { privateKey: otherPrivateKey } = await generateKeypair();
    const entries = { KEY: 'value' };
    const recipientPublicKeys = new Map([['@local', publicKey]]);

    const blocks = await encrypt(entries, recipientPublicKeys);
    const file = makeFile(blocks);
    await expect(decrypt(file, '@local', otherPrivateKey)).rejects.toThrow();
  });

  it('multi-recipient: each can decrypt', async () => {
    const kp1 = await generateKeypair();
    const kp2 = await generateKeypair();
    const entries = { SECRET: 'shared' };
    const recipientPublicKeys = new Map([
      ['@alice', kp1.publicKey],
      ['@bob', kp2.publicKey],
    ]);

    const blocks = await encrypt(entries, recipientPublicKeys);
    expect(blocks).toHaveLength(2);

    const file1 = makeFile([blocks[0]]);
    const file2 = makeFile([blocks[1]]);
    const dec1 = await decrypt(file1, '@alice', kp1.privateKey);
    const dec2 = await decrypt(file2, '@bob', kp2.privateKey);
    expect(dec1.entries).toEqual(entries);
    expect(dec2.entries).toEqual(entries);
  });

  it('decryptAny succeeds for non-primary recipient key', async () => {
    const kpLocal = await generateKeypair();
    const kpOther = await generateKeypair();
    const entries = { SHARED: 'value' };
    const recipientPublicKeys = new Map([
      ['@local', kpLocal.publicKey],
      ['teammate', kpOther.publicKey],
    ]);
    const file = await create(entries, '@local', recipientPublicKeys);

    const dec = await decryptAny(file, kpOther.privateKey, '@local');
    expect(dec.entries).toEqual(entries);
    expect(dec.recipient).toBe('teammate');
  });

  it('create produces valid file', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const entries = { FOO: 'bar' };
    const recipientPublicKeys = new Map([['@local', publicKey]]);

    const file = await create(entries, '@local', recipientPublicKeys);
    expect(file.header.keys).toHaveLength(1);
    expect(file.encryptedBlocks).toHaveLength(1);
    expect(file.header.keyId).toBeDefined();
    expect(typeof file.header.keyId).toBe('string');
    expect(file.header.keyId!.length).toBeGreaterThan(0);
    const result = await decrypt(file, '@local', privateKey);
    expect(result.entries).toEqual(entries);
  });

  it('encrypt with rawContent → decrypt returns raw', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const entries = { DB_HOST: 'localhost', API_KEY: 'sk-test' };
    const rawContent = '# Database\nDB_HOST=localhost\n\n# API Keys\nAPI_KEY=sk-test\n';
    const recipientPublicKeys = new Map([['@local', publicKey]]);

    const blocks = await encrypt(entries, recipientPublicKeys, rawContent);
    const file = makeFile(blocks);
    const result = await decrypt(file, '@local', privateKey);

    expect(result.entries).toEqual(entries);
    expect(result.raw).toBe(rawContent);
  });

  it('encrypt without rawContent → decrypt has no raw', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const entries = { KEY: 'value' };
    const recipientPublicKeys = new Map([['@local', publicKey]]);

    const blocks = await encrypt(entries, recipientPublicKeys);
    const file = makeFile(blocks);
    const result = await decrypt(file, '@local', privateKey);

    expect(result.entries).toEqual(entries);
    expect(result.raw).toBeUndefined();
  });

  it('create with rawContent → full roundtrip preserves comments', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const entries = { DB_HOST: 'localhost', DB_PORT: '5432' };
    const rawContent = `# Database config
DB_HOST=localhost
DB_PORT=5432

# End of file
`;
    const recipientPublicKeys = new Map([['@local', publicKey]]);

    const file = await create(entries, '@local', recipientPublicKeys, rawContent);
    const result = await decrypt(file, '@local', privateKey);

    expect(result.entries).toEqual(entries);
    expect(result.raw).toBe(rawContent);
  });

  it('create with rawContent populates header.structureComments for .env example', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const rawContent = `# DotEnvUp sample – fake typical project secrets
# DO NOT use these values in production
#
# Database
DB_HOST=localhost
DB_PASSWORD=secret
# API Keys
API_KEY=sk_test
`;
    const entries = { DB_HOST: 'localhost', DB_PASSWORD: 'secret', API_KEY: 'sk_test' };
    const recipientPublicKeys = new Map([['@local', publicKey]]);

    const file = await create(entries, '@local', recipientPublicKeys, rawContent);
    expect(file.header.structureComments).toBeDefined();
    expect(file.header.structureComments).toContain('# DotEnvUp sample – fake typical project secrets');
    expect(file.header.structureComments).toContain('# Database');
    expect(file.header.structureComments).toContain('# API Keys');
    const result = await decrypt(file, '@local', privateKey);
    expect(result.entries).toEqual(entries);
    expect(result.raw).toBe(rawContent);
  });

  it('raw content with commented-out secrets survives roundtrip', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const rawContent = `# Production secrets
DB_PASSWORD=secret123
# OLD_API_KEY=sk_live_PREVIOUSLY_USED_KEY_DO_NOT_DELETE
# TODO: rotate this key before March
API_KEY=sk_test_current
`;
    const entries = { DB_PASSWORD: 'secret123', API_KEY: 'sk_test_current' };
    const recipientPublicKeys = new Map([['@local', publicKey]]);

    const file = await create(entries, '@local', recipientPublicKeys, rawContent);
    const result = await decrypt(file, '@local', privateKey);

    expect(result.raw).toBe(rawContent);
    expect(result.raw).toContain('OLD_API_KEY=sk_live_PREVIOUSLY_USED_KEY_DO_NOT_DELETE');
    expect(result.raw).toContain('TODO: rotate this key before March');
  });

  it('raw content with special characters roundtrips correctly', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const rawContent = '# Ünîcödé comments ✓\nKEY="value with \\"quotes\\" and spaces"\n# 日本語\n';
    const entries = { KEY: 'value with "quotes" and spaces' };
    const recipientPublicKeys = new Map([['@local', publicKey]]);

    const file = await create(entries, '@local', recipientPublicKeys, rawContent);
    const result = await decrypt(file, '@local', privateKey);

    expect(result.raw).toBe(rawContent);
  });

  it('backward compat: old .env.up without _raw → entries work, raw is undefined', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const entries = { LEGACY: 'value' };
    const recipientPublicKeys = new Map([['@local', publicKey]]);

    // Encrypt WITHOUT rawContent (simulates old format)
    const blocks = await encrypt(entries, recipientPublicKeys);
    const file = makeFile(blocks);
    const result = await decrypt(file, '@local', privateKey);

    expect(result.entries).toEqual(entries);
    expect(result.raw).toBeUndefined();
  });

  it('keyFingerprint is consistent and 12 chars', async () => {
    const { publicKey } = await generateKeypair();
    const fp1 = await keyFingerprint(publicKey);
    const fp2 = await keyFingerprint(publicKey);
    expect(fp1).toBe(fp2);
    expect(fp1.length).toBeLessThanOrEqual(12);
    expect(/^[A-Za-z0-9_-]+$/.test(fp1)).toBe(true);
  });
});

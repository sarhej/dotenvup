import { describe, it, expect } from 'vitest';
import {
  generateKeypair,
  encrypt,
  create,
  parse,
  serialize,
  mergeReencrypt,
  reencryptAll,
  verifyEnvUp,
  type EnvUpPolicy,
} from '../index.js';
import { decrypt as decryptBlock } from '../crypto.js';

describe('policy-aware encrypt', () => {
  it('ENC-01: disjoint subsets per recipient', async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const entries = {
      DB_HOST: 'localhost',
      API_KEY: 'shared',
      PROD_DB_URL: 'postgres://prod',
      JWT_SECRET: 'jwt',
    };
    const policy: EnvUpPolicy = {
      version: 1,
      rows: [
        { recipient: '@alice', keys: ['DB_HOST', 'API_KEY', 'PROD_DB_URL', 'JWT_SECRET'] },
        { recipient: '@bob', keys: ['DB_HOST', 'API_KEY'] },
      ],
    };
    const keys = new Map([
      ['@alice', alice.publicKey],
      ['@bob', bob.publicKey],
    ]);

    const blocks = await encrypt(entries, keys, undefined, policy);
    expect(blocks).toHaveLength(2);

    const aliceBlock = blocks.find((b) => b.recipient === '@alice')!;
    const bobBlock = blocks.find((b) => b.recipient === '@bob')!;

    const aliceDec = await decryptBlock(aliceBlock, alice.privateKey);
    const bobDec = await decryptBlock(bobBlock, bob.privateKey);

    expect(Object.keys(aliceDec.entries).sort()).toEqual([
      'API_KEY',
      'DB_HOST',
      'JWT_SECRET',
      'PROD_DB_URL',
    ]);
    expect(Object.keys(bobDec.entries).sort()).toEqual(['API_KEY', 'DB_HOST']);
    expect(bobDec.entries.PROD_DB_URL).toBeUndefined();
  });

  it('ENC-05: filters _raw for recipient subset', async () => {
    const bob = await generateKeypair();
    const alice = await generateKeypair();
    const raw = `DB_HOST=localhost
PROD_DB_URL=postgres://prod
API_KEY=token
`;
    const policy: EnvUpPolicy = {
      version: 1,
      rows: [
        { recipient: '@alice', keys: ['DB_HOST', 'API_KEY', 'PROD_DB_URL'] },
        { recipient: '@bob', keys: ['DB_HOST', 'API_KEY'] },
      ],
    };
    const keys = new Map([
      ['@alice', alice.publicKey],
      ['@bob', bob.publicKey],
    ]);
    const entries = {
      DB_HOST: 'localhost',
      PROD_DB_URL: 'postgres://prod',
      API_KEY: 'token',
    };

    const blocks = await encrypt(entries, keys, raw, policy);
    const bobBlock = blocks.find((b) => b.recipient === '@bob')!;
    const bobDec = await decryptBlock(bobBlock, bob.privateKey);

    expect(bobDec.raw).toBeDefined();
    expect(bobDec.raw).toContain('DB_HOST');
    expect(bobDec.raw).not.toContain('PROD_DB_URL');
    expect(bobDec.raw).not.toContain('postgres://prod');
  });

  it('ENC-04: legacy mode unchanged', async () => {
    const kp = await generateKeypair();
    const entries = { KEY: 'value' };
    const keys = new Map([['@local', kp.publicKey]]);
    const blocks = await encrypt(entries, keys);
    const dec = await decryptBlock(blocks[0], kp.privateKey);
    expect(dec.entries).toEqual(entries);
  });
});

describe('mergeReencrypt', () => {
  it('MRG-01: Bob edit preserves Alice block', async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const fullEntries = {
      DB_HOST: 'localhost',
      API_KEY: 'shared',
      PROD_DB_URL: 'postgres://prod',
      JWT_SECRET: 'jwt',
    };
    const policy: EnvUpPolicy = {
      version: 1,
      rows: [
        { recipient: '@alice', keys: ['DB_HOST', 'API_KEY', 'PROD_DB_URL', 'JWT_SECRET'] },
        { recipient: '@bob', keys: ['DB_HOST', 'API_KEY'] },
      ],
    };
    const recipientKeys = new Map([
      ['@alice', alice.publicKey],
      ['@bob', bob.publicKey],
    ]);

    let file = await create(fullEntries, '@alice', recipientKeys, undefined, policy);
    const aliceBlockBefore = file.encryptedBlocks.find((b) => b.recipient === '@alice')!;

    file = await mergeReencrypt({
      existing: file,
      editorRecipientId: '@bob',
      newEntries: { DB_HOST: 'localhost', API_KEY: 'bob-updated' },
      privateKey: bob.privateKey,
      recipientPublicKeys: recipientKeys,
      author: '@bob',
    });

    const aliceBlockAfter = file.encryptedBlocks.find((b) => b.recipient === '@alice')!;
    expect(aliceBlockAfter).toEqual(aliceBlockBefore);

    const bobDec = await decryptBlock(
      file.encryptedBlocks.find((b) => b.recipient === '@bob')!,
      bob.privateKey,
    );
    expect(bobDec.entries.API_KEY).toBe('bob-updated');
    expect(bobDec.entries.DB_HOST).toBe('localhost');

    const aliceDec = await decryptBlock(aliceBlockAfter, alice.privateKey);
    expect(aliceDec.entries.PROD_DB_URL).toBe('postgres://prod');
    expect(aliceDec.entries.API_KEY).toBe('shared');
  });

  it('MRG-03: rejects keys outside policy slice', async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const policy: EnvUpPolicy = {
      version: 1,
      rows: [
        { recipient: '@alice', keys: ['DB_HOST', 'API_KEY', 'JWT_SECRET'] },
        { recipient: '@bob', keys: ['DB_HOST', 'API_KEY'] },
      ],
    };
    const recipientKeys = new Map([
      ['@alice', alice.publicKey],
      ['@bob', bob.publicKey],
    ]);
    const file = await create(
      { DB_HOST: 'h', API_KEY: 'a', JWT_SECRET: 'j' },
      '@alice',
      recipientKeys,
      undefined,
      policy,
    );

    await expect(
      mergeReencrypt({
        existing: file,
        editorRecipientId: '@bob',
        newEntries: { JWT_SECRET: 'stolen' },
        privateKey: bob.privateKey,
        recipientPublicKeys: recipientKeys,
        author: '@bob',
      }),
    ).rejects.toThrow(/policy slice/i);
  });

  it('MRG-NEW-01: appends new catalog key on merge when in policy slice', async () => {
    const alice = await generateKeypair();
    const policy: EnvUpPolicy = {
      version: 1,
      rows: [{ recipient: '@alice', keys: ['A', 'B'] }],
    };
    const keys = new Map([['@alice', alice.publicKey]]);
    let file = await create({ A: '1' }, '@alice', keys, undefined, policy);
    file = await mergeReencrypt({
      existing: file,
      editorRecipientId: '@alice',
      newEntries: { A: '1', B: 'two' },
      privateKey: alice.privateKey,
      recipientPublicKeys: keys,
      author: '@alice',
    });
    expect(file.header.keys.map((k) => k.name).sort()).toEqual(['A', 'B']);
  });

  it('MRG-REM-01: removes key from editor block when omitted from .env (policy)', async () => {
    const bob = await generateKeypair();
    const policy: EnvUpPolicy = {
      version: 1,
      rows: [{ recipient: '@bob', keys: ['DB_HOST', 'API_KEY'] }],
    };
    const keys = new Map([['@bob', bob.publicKey]]);
    const file = await create(
      { DB_HOST: 'h', API_KEY: 'a' },
      '@bob',
      keys,
      undefined,
      policy,
    );
    const updated = await mergeReencrypt({
      existing: file,
      editorRecipientId: '@bob',
      newEntries: { DB_HOST: 'h' },
      privateKey: bob.privateKey,
      recipientPublicKeys: keys,
      author: '@bob',
    });
    const block = updated.encryptedBlocks[0];
    const dec = await decryptBlock(block, bob.privateKey);
    expect(dec.entries).toEqual({ DB_HOST: 'h' });
  });

  it('MRG-05: legacy multi-recipient preserves other block on merge', async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const entries = { SHARED: 'v1', ALICE_ONLY: 'secret' };
    const keys = new Map([
      ['@alice', alice.publicKey],
      ['@bob', bob.publicKey],
    ]);
    const file = await create(entries, '@alice', keys);
    const bobBlockBefore = file.encryptedBlocks.find((b) => b.recipient === '@bob')!;

    const updated = await mergeReencrypt({
      existing: file,
      editorRecipientId: '@alice',
      newEntries: { SHARED: 'v2', ALICE_ONLY: 'secret' },
      privateKey: alice.privateKey,
      recipientPublicKeys: keys,
      author: '@alice',
    });

    expect(updated.encryptedBlocks.find((b) => b.recipient === '@bob')).toEqual(bobBlockBefore);
    const aliceDec = await decryptBlock(
      updated.encryptedBlocks.find((b) => b.recipient === '@alice')!,
      alice.privateKey,
    );
    expect(aliceDec.entries.SHARED).toBe('v2');
  });

  it('MRG-07: reencryptAll adds filtered block for new policy recipient', async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const keys = new Map([
      ['@alice', alice.publicKey],
      ['@bob', bob.publicKey],
    ]);
    let file = await create({ K: 'v' }, '@alice', keys);
    file.policy = {
      version: 1,
      rows: [
        { recipient: '@alice', keys: ['K'] },
        { recipient: '@bob', keys: ['K'] },
      ],
    };
    file.header.encryptedFor = ['@alice', '@bob'];
    const updated = await reencryptAll(file, { K: 'v' }, '@alice', keys);
    expect(updated.encryptedBlocks).toHaveLength(2);
    const bobDec = await decryptBlock(
      updated.encryptedBlocks.find((b) => b.recipient === '@bob')!,
      bob.privateKey,
    );
    expect(bobDec.entries).toEqual({ K: 'v' });
  });
});

describe('verifyEnvUp', () => {
  it('structural verify without private key', async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const policy: EnvUpPolicy = {
      version: 1,
      rows: [
        { recipient: '@alice', keys: ['API_KEY'] },
        { recipient: '@bob', keys: ['API_KEY'] },
      ],
    };
    const file = await create({ API_KEY: 'x' }, '@alice', new Map([
      ['@alice', alice.publicKey],
      ['@bob', bob.publicKey],
    ]), undefined, policy);

    const result = await verifyEnvUp(file);
    expect(result.ok).toBe(true);
  });

  it('V3 detects superset in decrypted block', async () => {
    const kp = await generateKeypair();
    const file = await create({ A: '1', B: '2' }, '@local', new Map([['@local', kp.publicKey]]));
    file.policy = {
      version: 1,
      rows: [{ recipient: '@local', keys: ['A'] }],
    };

    const result = await verifyEnvUp(file, kp.privateKey);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'V3')).toBe(true);
  });
});

describe('reencryptAll', () => {
  it('reencrypts all blocks with policy filter', async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const policy: EnvUpPolicy = {
      version: 1,
      rows: [
        { recipient: '@alice', keys: ['DB_HOST', 'API_KEY'] },
        { recipient: '@bob', keys: ['DB_HOST'] },
      ],
    };
    const keys = new Map([
      ['@alice', alice.publicKey],
      ['@bob', bob.publicKey],
    ]);
    const base = await create({ DB_HOST: 'h', API_KEY: 'k' }, '@alice', keys, undefined, policy);
    const updated = await reencryptAll(base, { DB_HOST: 'new', API_KEY: 'k' }, '@alice', keys);

    const bobDec = await decryptBlock(
      updated.encryptedBlocks.find((b) => b.recipient === '@bob')!,
      bob.privateKey,
    );
    expect(bobDec.entries).toEqual({ DB_HOST: 'new' });
    expect(bobDec.entries.API_KEY).toBeUndefined();
  });
});

describe('roundtrip serialize', () => {
  it('parse serialize parse preserves policy', async () => {
    const kp = await generateKeypair();
    const policy: EnvUpPolicy = {
      version: 1,
      rows: [{ recipient: '@local', keys: ['KEY'] }],
    };
    const file = await create({ KEY: 'v' }, '@local', new Map([['@local', kp.publicKey]]), undefined, policy);
    const reparsed = parse(serialize(file));
    expect(reparsed.policy).toEqual(policy);
  });
});

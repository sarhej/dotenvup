import { describe, it, expect } from 'vitest';
import {
  generateKeypair,
  create,
  mergeReencrypt,
  revokeRecipientFromFile,
  pruneCatalogToPolicy,
  validatePolicy,
  assertCanReencryptAll,
  assertDecryptRespectsPolicy,
  PolicyValidationError,
  writeEnvUpAtomic,
  serialize,
  parse,
  decryptAny,
} from '../index.js';
import { decrypt as decryptBlock } from '../crypto.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('revokeRecipientFromFile', () => {
  it('MRG-06: removes policy row, block, and prunes exclusive catalog keys', async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const keys = new Map([
      ['@alice', alice.publicKey],
      ['bob', bob.publicKey],
    ]);
    const file = await create(
      { SHARED: 's', BOB_ONLY: 'b' },
      '@alice',
      keys,
      undefined,
      {
        version: 1,
        rows: [
          { recipient: '@alice', keys: ['SHARED', 'BOB_ONLY'] },
          { recipient: 'bob', keys: ['SHARED', 'BOB_ONLY'] },
        ],
      },
    );

    const revoked = revokeRecipientFromFile(file, 'bob');
    expect(revoked.policy?.rows).toHaveLength(1);
    expect(revoked.encryptedBlocks).toHaveLength(1);
    expect(revoked.encryptedBlocks[0].recipient).toBe('@alice');
    expect(validatePolicy(revoked).ok).toBe(true);

    const bobBlock = file.encryptedBlocks.find((b) => b.recipient === 'bob')!;
    await expect(decryptBlock(bobBlock, bob.privateKey)).resolves.toBeDefined();
    await expect(
      decryptBlock(revoked.encryptedBlocks[0], bob.privateKey),
    ).rejects.toThrow();
  });
});

describe('pruneCatalogToPolicy', () => {
  it('drops keys not referenced in any policy row', () => {
    const pruned = pruneCatalogToPolicy(
      [
        { name: 'A', version: 1, updatedAt: 't', author: '@x' },
        { name: 'B', version: 1, updatedAt: 't', author: '@x' },
      ],
      { version: 1, rows: [{ recipient: '@x', keys: ['A'] }] },
    );
    expect(pruned.map((k) => k.name)).toEqual(['A']);
  });
});

describe('shared key sync on owner merge', () => {
  it('reencrypts all blocks when owner holds full catalog and all pubkeys', async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const keys = new Map([
      ['@alice', alice.publicKey],
      ['bob', bob.publicKey],
    ]);
    const policy = {
      version: 1,
      rows: [
        { recipient: '@alice', keys: ['SHARED', 'ALICE_ONLY'] },
        { recipient: 'bob', keys: ['SHARED'] },
      ],
    };
    const file = await create(
      { SHARED: 'old', ALICE_ONLY: 'secret' },
      '@alice',
      keys,
      undefined,
      policy,
    );

    const updated = await mergeReencrypt({
      existing: file,
      editorRecipientId: '@alice',
      newEntries: { SHARED: 'new', ALICE_ONLY: 'secret' },
      privateKey: alice.privateKey,
      recipientPublicKeys: keys,
      author: '@alice',
    });

    const bobDec = await decryptBlock(
      updated.encryptedBlocks.find((b) => b.recipient === 'bob')!,
      bob.privateKey,
    );
    expect(bobDec.entries).toEqual({ SHARED: 'new' });
    expect(bobDec.entries.ALICE_ONLY).toBeUndefined();
  });
});

describe('assertCanReencryptAll', () => {
  it('refuses partial-slice reencrypt (security gate)', async () => {
    const alice = await generateKeypair();
    const bob = await generateKeypair();
    const keys = new Map([
      ['@alice', alice.publicKey],
      ['bob', bob.publicKey],
    ]);
    const file = await create(
      { SHARED: 's', ALICE_ONLY: 'secret' },
      '@alice',
      keys,
      undefined,
      {
        version: 1,
        rows: [
          { recipient: '@alice', keys: ['SHARED', 'ALICE_ONLY'] },
          { recipient: 'bob', keys: ['SHARED'] },
        ],
      },
    );

    expect(() =>
      assertCanReencryptAll(file, 'bob', { SHARED: 's' }, keys),
    ).toThrow(/full-catalog|missing catalog/i);

    expect(() =>
      assertCanReencryptAll(file, '@alice', { SHARED: 's', ALICE_ONLY: 'secret' }, keys),
    ).not.toThrow();
  });
});

describe('assertDecryptRespectsPolicy', () => {
  it('throws V3 when ciphertext is a policy superset', () => {
    expect(() =>
      assertDecryptRespectsPolicy(
        'bob',
        { SHARED: 's', ALICE_ONLY: 'leak' },
        {
          version: 1,
          rows: [
            { recipient: '@alice', keys: ['SHARED', 'ALICE_ONLY'] },
            { recipient: 'bob', keys: ['SHARED'] },
          ],
        },
      ),
    ).toThrow(PolicyValidationError);
  });

  it('allows exact policy slice', () => {
    expect(() =>
      assertDecryptRespectsPolicy(
        'bob',
        { SHARED: 's' },
        {
          version: 1,
          rows: [{ recipient: 'bob', keys: ['SHARED'] }],
        },
      ),
    ).not.toThrow();
  });
});

describe('writeEnvUpAtomic', () => {
  it('replaces file after decrypt verification', async () => {
    const kp = await generateKeypair();
    const keys = new Map([['@local', kp.publicKey]]);
    const file = await create({ A: '1' }, '@local', keys);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotenvup-atomic-'));
    const envUpPath = path.join(dir, '.env.up');
    await fs.writeFile(envUpPath, '#!dotenvup v1\nplaceholder\n', 'utf8');

    await writeEnvUpAtomic(envUpPath, serialize(file), kp.privateKey);
    const parsed = parse(await fs.readFile(envUpPath, 'utf8'));
    const { entries } = await decryptAny(parsed, kp.privateKey, '@local');
    expect(entries).toEqual({ A: '1' });
    await fs.rm(dir, { recursive: true, force: true });
  });
});

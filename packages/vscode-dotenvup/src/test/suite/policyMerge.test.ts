/**
 * Policy-aware merge path (team secrets) — EXT-01, EXT-02, EXT-04.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createTempWorkspace } from '../fixtures';
import { SafeEditFSProvider } from '../../providers/safeEditFSProvider';
import { ExtensionKeyStore } from '../../keystore';
import { reencryptLocked } from '../../commands/reencryptEnvUp';

class MockKeyStore extends ExtensionKeyStore {
  private keys: { publicKey: Uint8Array; privateKey: Uint8Array } | null = null;
  private identityDir: string;

  constructor(identityDir: string) {
    // @ts-expect-error test mock
    super({});
    this.identityDir = identityDir;
  }

  async hasKeypair(): Promise<boolean> { return !!this.keys; }
  async getPublicKey(): Promise<Uint8Array | null> { return this.keys?.publicKey ?? null; }
  async getPrivateKey(): Promise<Uint8Array | null> { return this.keys?.privateKey ?? null; }
  async requirePrivateKey(): Promise<Uint8Array> {
    if (!this.keys?.privateKey) throw new Error('No keypair');
    return this.keys.privateKey;
  }
  async storeKeypair(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
    this.keys = { publicKey, privateKey };
  }
  getIdentityDir(): string { return this.identityDir; }
}

suite('Policy merge (team secrets)', () => {
  let tempDir: string;
  let aliceStore: MockKeyStore;
  let bobStore: MockKeyStore;
  let provider: SafeEditFSProvider;
  let envUpPath: string;
  let aliceBlockBefore: import('@dotenvup/format').EnvUpRecipientBlock;

  suiteSetup(async () => {
    const { generateKeypair, create, serialize, addRecipient } = await import('@dotenvup/format');
    const alice = await generateKeypair();
    const bob = await generateKeypair();

    tempDir = await createTempWorkspace({});
    aliceStore = new MockKeyStore(path.join(tempDir, 'alice-id'));
    bobStore = new MockKeyStore(path.join(tempDir, 'bob-id'));
    await aliceStore.storeKeypair(alice.publicKey, alice.privateKey);
    await bobStore.storeKeypair(bob.publicKey, bob.privateKey);

    await addRecipient(tempDir, bob.publicKey, 'bob');

    const recipientKeys = new Map<string, Uint8Array>([
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
      { SHARED: 'shared-val', ALICE_ONLY: 'alice-secret' },
      '@alice',
      recipientKeys,
      'SHARED=shared-val\nALICE_ONLY=alice-secret\n',
      policy,
    );
    envUpPath = path.join(tempDir, '.env.up');
    await fs.writeFile(envUpPath, serialize(file), 'utf8');
    aliceBlockBefore = file.encryptedBlocks.find((b) => b.recipient === '@alice')!;

    provider = new SafeEditFSProvider(bobStore);
  });

  suiteTeardown(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('EXT-01: Safe Edit open shows only decrypted policy slice', async () => {
    const uri = vscode.Uri.parse(`dotenvup-safe:${path.join(tempDir, '.env')}`);
    const content = await provider.readFile(uri);
    const text = new TextDecoder().decode(content);
    assert.ok(text.includes('SHARED='), 'Bob should see SHARED');
    assert.ok(!text.includes('ALICE_ONLY'), 'Bob must not see Alice-only key');
    assert.ok(!text.includes('alice-secret'), 'Alice-only value must not appear');
  });

  test('EXT-02: Safe Edit save merge preserves other recipient block', async () => {
    const uri = vscode.Uri.parse(`dotenvup-safe:${path.join(tempDir, '.env')}`);
    await provider.writeFile(
      uri,
      new TextEncoder().encode('SHARED=bob-edited\n'),
      { create: false, overwrite: true },
    );

    const { parse, decrypt } = await import('@dotenvup/format');
    const updated = parse(await fs.readFile(envUpPath, 'utf8'));
    const aliceBlockAfter = updated.encryptedBlocks.find((b) => b.recipient === '@alice')!;
    assert.deepStrictEqual(aliceBlockAfter, aliceBlockBefore, 'Alice block unchanged on Bob save');

    const bobBlock = updated.encryptedBlocks.find((b) => b.recipient === 'bob');
    assert.ok(bobBlock, 'Bob block still present');
    const bobDec = await decrypt(updated, 'bob', await bobStore.requirePrivateKey());
    assert.strictEqual(bobDec.entries.SHARED, 'bob-edited');
  });

  test('EXT-04: Re-encrypt command uses policy path (all blocks)', async () => {
    const aliceProvider = new SafeEditFSProvider(aliceStore);
    const uri = vscode.Uri.parse(`dotenvup-safe:${path.join(tempDir, '.env')}`);
    await aliceProvider.writeFile(
      uri,
      new TextEncoder().encode(
        'SHARED=owner-sync\nALICE_ONLY=alice-secret\n',
      ),
      { create: false, overwrite: true },
    );

    await reencryptLocked(envUpPath, tempDir, aliceStore);

    const { parse, decrypt } = await import('@dotenvup/format');
    const file = parse(await fs.readFile(envUpPath, 'utf8'));
    assert.ok(file.policy, 'Policy section preserved');
    const bobBlock = file.encryptedBlocks.find((b) => b.recipient === 'bob');
    assert.ok(bobBlock, 'Bob block present after reencrypt');
    const bobDec = await decrypt(file, 'bob', await bobStore.requirePrivateKey());
    assert.strictEqual(bobDec.entries.SHARED, 'owner-sync');
    assert.strictEqual(bobDec.entries.ALICE_ONLY, undefined);
  });
});

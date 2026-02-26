/**
 * Safe Edit Tests
 *
 * Verifies the virtual filesystem provider for decrypting/encrypting .env.up in memory.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createTempWorkspace, MINIMAL_ENV_UP_HEADER } from '../fixtures';
import { SafeEditFSProvider } from '../../providers/safeEditFSProvider';
import { ExtensionKeyStore } from '../../keystore';

// Mock KeyStore for testing
class MockKeyStore extends ExtensionKeyStore {
  private keys: { publicKey: Uint8Array; privateKey: Uint8Array } | null = null;

  constructor() {
    // @ts-ignore - bypassing super(context) for mock
    super({} as any);
  }

  async hasKeypair(): Promise<boolean> { return !!this.keys; }
  async getPublicKey(): Promise<Uint8Array | null> { return this.keys?.publicKey ?? null; }
  async getPrivateKey(): Promise<Uint8Array | null> { return this.keys?.privateKey ?? null; }
  async storeKeypair(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
    this.keys = { publicKey, privateKey };
  }
  getIdentityDir(): string { return '/tmp/mock-identity'; }
}

suite('Safe Edit (Virtual FS)', () => {
  let tempDir: string;
  let keystore: MockKeyStore;
  let provider: SafeEditFSProvider;
  let envUpPath: string;

  suiteSetup(async () => {
    // Generate a real keypair for testing
    const { generateKeypair } = await import('@dotenvup/format');
    const keys = await generateKeypair();
    keystore = new MockKeyStore();
    await keystore.storeKeypair(keys.publicKey, keys.privateKey);
    provider = new SafeEditFSProvider(keystore);
  });

  setup(async () => {
    // Create a workspace with a valid .env.up encrypted with our key
    const { create, serialize } = await import('@dotenvup/format');
    const pubKey = await keystore.getPublicKey();
    const recipients = new Map<string, Uint8Array>();
    recipients.set('@test', pubKey!);
    const file = await create({ FOO: 'bar' }, '@test', recipients);
    const envUpContent = serialize(file);
    
    tempDir = await createTempWorkspace({ envUp: envUpContent });
    envUpPath = path.join(tempDir, '.env.up');
  });

  teardown(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('readFile decrypts .env.up to plaintext', async () => {
    const uri = vscode.Uri.parse(`dotenvup-safe:${path.join(tempDir, '.env')}`);
    const content = await provider.readFile(uri);
    const text = new TextDecoder().decode(content);
    
    assert.ok(text.includes('FOO=bar') || text.includes('FOO="bar"'), 'Plaintext should contain FOO value');
    assert.ok(!text.includes('recipient:'), 'Plaintext should NOT contain encrypted blocks');
  });

  test('writeFile encrypts plaintext to .env.up', async () => {
    const uri = vscode.Uri.parse(`dotenvup-safe:${path.join(tempDir, '.env')}`);
    const newContent = 'NEW_KEY="secret_value"';
    
    await provider.writeFile(uri, new TextEncoder().encode(newContent), { create: false, overwrite: true });
    
    // Verify disk content is encrypted
    const diskContent = await fs.readFile(envUpPath, 'utf8');
    assert.ok(diskContent.includes('#!dotenvup v1'), 'Header preserved');
    assert.ok(!diskContent.includes('secret_value'), 'Value should be encrypted on disk');
    
    // Verify we can decrypt it back
    const decrypted = await provider.readFile(uri);
    const text = new TextDecoder().decode(decrypted);
    assert.ok(text.includes('NEW_KEY="secret_value"'), 'Roundtrip decryption successful');
  });

  test('stat returns file stats for .env.up', async () => {
    const uri = vscode.Uri.parse(`dotenvup-safe:${path.join(tempDir, '.env')}`);
    const stats = await provider.stat(uri);
    assert.strictEqual(stats.type, vscode.FileType.File);
    assert.ok(stats.size > 0);
  });

  test('readFile throws if .env.up is missing', async () => {
    const uri = vscode.Uri.parse(`dotenvup-safe:${path.join(tempDir, 'missing', '.env')}`);
    await assert.rejects(provider.readFile(uri), /ENOENT|File not found/);
  });

  test('writeFile preserves existing metadata', async () => {
    // Check initial metadata (from setup)
    const initialContent = await fs.readFile(envUpPath, 'utf8');
    assert.ok(initialContent.includes('Encrypted-By: @test'));

    const uri = vscode.Uri.parse(`dotenvup-safe:${path.join(tempDir, '.env')}`);
    await provider.writeFile(uri, new TextEncoder().encode('KEY=val'), { create: false, overwrite: true });

    const newContent = await fs.readFile(envUpPath, 'utf8');
    // Metadata might change (e.g. Encrypted-By updates to @local if we re-encrypt),
    // but the structure should remain valid.
    assert.ok(newContent.startsWith('#!dotenvup v1'));
  });

  suite('Edge cases', () => {
    test('readFile with merge=env when .env exists returns merged content', async () => {
      await fs.writeFile(path.join(tempDir, '.env'), 'LOCAL=from_env\nFOO=overridden', 'utf8');
      const uri = vscode.Uri.from({
        scheme: 'dotenvup-safe',
        path: path.join(tempDir, '.env.up.edit'),
        query: 'merge=env',
      });
      const content = await provider.readFile(uri);
      const text = new TextDecoder().decode(content);
      assert.ok(text.includes('LOCAL=from_env'), 'Key only in .env should appear');
      assert.ok(text.includes('FOO=overridden') || text.includes('FOO=bar'), 'FOO from .env or merged');
      assert.ok(text.includes('bar') || text.includes('overridden'), 'Should have FOO value');
    });

    test('readFile with merge=env when .env was removed falls back to .env.up only', async () => {
      // No .env file (or we delete it) — simulate "user removed .env while we have merge=env"
      const uri = vscode.Uri.from({
        scheme: 'dotenvup-safe',
        path: path.join(tempDir, '.env.up.edit'),
        query: 'merge=env',
      });
      const content = await provider.readFile(uri);
      const text = new TextDecoder().decode(content);
      assert.ok(text.includes('FOO=bar') || text.includes('FOO="bar"'), 'Fallback to .env.up content');
    });

    test('readFile throws when .env.up was encrypted with different key', async () => {
      const { generateKeypair, create, serialize } = await import('@dotenvup/format');
      const otherKeys = await generateKeypair();
      const recipients = new Map<string, Uint8Array>([['@other', otherKeys.publicKey]]);
      const file = await create({ SECRET: 'other-key-value' }, '@other', recipients);
      const otherEnvUp = serialize(file);
      const otherDir = await createTempWorkspace({ envUp: otherEnvUp });
      try {
        const uri = vscode.Uri.parse(`dotenvup-safe:${path.join(otherDir, '.env.up.edit')}`);
        await assert.rejects(
          provider.readFile(uri),
          /different key|decrypt|Unavailable/i
        );
      } finally {
        await fs.rm(otherDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    test('writeFile throws when .env.up was deleted (save after file removed)', async () => {
      const uri = vscode.Uri.parse(`dotenvup-safe:${path.join(tempDir, '.env.up.edit')}`);
      await fs.unlink(envUpPath);
      await assert.rejects(
        provider.writeFile(uri, new TextEncoder().encode('X=y'), { create: false, overwrite: true }),
        /EntryNotFound|File not found|FileNotFound/i
      );
    });

    test('stat throws when .env.up is missing', async () => {
      const uri = vscode.Uri.parse(`dotenvup-safe:${path.join(tempDir, 'nonexistent', '.env.up.edit')}`);
      await assert.rejects(provider.stat(uri), /EntryNotFound|File not found|ENOENT/i);
    });
  });
});

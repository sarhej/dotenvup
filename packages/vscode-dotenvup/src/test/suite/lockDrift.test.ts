/**
 * Lock command with drift: ensure "Save to .env.up & Lock" preserves changes
 * and that the dialog never offers "discard changes".
 *
 * Why this was missing: extension tests only asserted command registration,
 * not the lock flow when .env has changes not in .env.up.
 *
 * These tests require @dotenvup/format (ESM). When run inside the VS Code
 * extension host (CJS), format may not resolve; the suite is skipped in that case.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ExtensionKeyStore } from '../../keystore';
import * as lockCmd from '../../commands/lock';

// @dotenvup/format is ESM-only; in CJS extension host it may fail to load
let format: typeof import('@dotenvup/format') | null = null;
try {
  format = require('@dotenvup/format') as typeof import('@dotenvup/format');
} catch {
  // Suite will skip when format cannot be required (e.g. in VS Code test host)
}

async function createTempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `dotenvup-lock-drift-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Create a decryptable .env.up with the given entries. */
async function writeEnvUp(dir: string, entries: Record<string, string>, publicKey: Uint8Array): Promise<void> {
  if (!format) throw new Error('format not loaded');
  const recipientKeys = new Map([['@local', publicKey]]);
  const file = await format.create(entries, '@local', recipientKeys);
  await fs.writeFile(path.join(dir, '.env.up'), format.serialize(file), 'utf8');
}

suite('Lock with drift', () => {
  test('drift dialog offers Save & Lock and Cancel only (no discard)', async function () {
    if (!format) {
      this.skip();
      return;
    }
    const { generateKeypair } = format;
    const dir = await createTempDir();
    const { publicKey, privateKey } = await generateKeypair();
    await writeEnvUp(dir, { A: '1' }, publicKey);
    await fs.writeFile(path.join(dir, '.env'), 'A=1\nB=2', 'utf8');

    let capturedMessage = '';
    let capturedItems: string[] = [];
    const origShowWarning = vscode.window.showWarningMessage;
    (vscode.window as { showWarningMessage: (msg: string, ...items: string[]) => Thenable<string | undefined> })
      .showWarningMessage = (msg: string, ...items: string[]) => {
      capturedMessage = msg;
      capturedItems = items;
      return Promise.resolve(undefined);
    };

    const mockKeystore = {
      getPrivateKey: () => Promise.resolve(privateKey),
      getPublicKey: () => Promise.resolve(publicKey),
    } as unknown as ExtensionKeyStore;

    try {
      await lockCmd.run(mockKeystore, dir);
    } finally {
      (vscode.window as { showWarningMessage: (msg: string, ...items: string[]) => Thenable<string | undefined> })
        .showWarningMessage = origShowWarning;
    }

    assert.ok(capturedMessage.includes('not saved to .env.up'), 'message mentions unsaved changes');
    assert.ok(!capturedMessage.toLowerCase().includes('discard'), 'message must NOT offer discard');
    assert.deepStrictEqual(
      capturedItems,
      ['Save to .env.up & Lock', 'Cancel'],
      'only Save & Lock and Cancel options',
    );

    await fs.rm(dir, { recursive: true, force: true });
  });

  test('Save to .env.up & Lock imports then locks — changes preserved', async function () {
    if (!format) {
      this.skip();
      return;
    }
    const dir = await createTempDir();
    const { publicKey, privateKey } = await format.generateKeypair();
    await writeEnvUp(dir, { A: '1' }, publicKey);
    await fs.writeFile(path.join(dir, '.env'), 'A=1\nB=2', 'utf8');

    const origShowWarning = vscode.window.showWarningMessage;
    const origGetConfig = vscode.workspace.getConfiguration;
    (vscode.window as { showWarningMessage: (msg: string, ...items: string[]) => Thenable<string | undefined> })
      .showWarningMessage = (_msg: string, ...items: string[]) => Promise.resolve(items[0]);
    (vscode.workspace as {
      getConfiguration: (section?: string, scope?: vscode.ConfigurationScope | null) => vscode.WorkspaceConfiguration;
    }).getConfiguration = (section?: string) => ({
      get: (key: string, defaultValue?: boolean) => {
        if (section !== 'dotenvup') return defaultValue;
        if (key === 'confirmOnLock') return false;
        if (key === 'createBackupBeforeLock') return false;
        return defaultValue;
      },
    }) as vscode.WorkspaceConfiguration;

    const mockKeystore = {
      getPrivateKey: () => Promise.resolve(privateKey),
      getPublicKey: () => Promise.resolve(publicKey),
    } as unknown as ExtensionKeyStore;

    try {
      await lockCmd.run(mockKeystore, dir);
    } finally {
      (vscode.window as { showWarningMessage: (msg: string, ...items: string[]) => Thenable<string | undefined> })
        .showWarningMessage = origShowWarning;
      (vscode.workspace as {
        getConfiguration: (section?: string, scope?: vscode.ConfigurationScope | null) => vscode.WorkspaceConfiguration;
      }).getConfiguration = origGetConfig;
    }

    await assert.rejects(fs.access(path.join(dir, '.env')), '.env must be removed after lock');
    const envUpContent = await fs.readFile(path.join(dir, '.env.up'), 'utf8');
    const file = format!.parse(envUpContent);
    const { entries } = await format!.decryptAny(file, privateKey, '@local');
    assert.strictEqual(entries.A, '1');
    assert.strictEqual(entries.B, '2', 'new key B must be in .env.up after Save & Lock');

    await fs.rm(dir, { recursive: true, force: true });
  });

  test('Cancel on drift leaves .env and .env.up unchanged', async function () {
    if (!format) {
      this.skip();
      return;
    }
    const dir = await createTempDir();
    const { publicKey, privateKey } = await format.generateKeypair();
    await writeEnvUp(dir, { A: '1' }, publicKey);
    await fs.writeFile(path.join(dir, '.env'), 'A=1\nB=2', 'utf8');

    const origShowWarning = vscode.window.showWarningMessage;
    (vscode.window as { showWarningMessage: (msg: string, ...items: string[]) => Thenable<string | undefined> })
      .showWarningMessage = () => Promise.resolve(undefined);

    const mockKeystore = {
      getPrivateKey: () => Promise.resolve(privateKey),
      getPublicKey: () => Promise.resolve(publicKey),
    } as unknown as ExtensionKeyStore;

    try {
      await lockCmd.run(mockKeystore, dir);
    } finally {
      (vscode.window as { showWarningMessage: (msg: string, ...items: string[]) => Thenable<string | undefined> })
        .showWarningMessage = origShowWarning;
    }

    const envContent = await fs.readFile(path.join(dir, '.env'), 'utf8');
    assert.ok(envContent.includes('B=2'), '.env must still have B');
    const envUpContent = await fs.readFile(path.join(dir, '.env.up'), 'utf8');
    const file = format!.parse(envUpContent);
    const { entries } = await format!.decryptAny(file, privateKey, '@local');
    assert.strictEqual(entries.A, '1');
    assert.strictEqual(entries.B, undefined, '.env.up must NOT have B after Cancel');

    await fs.rm(dir, { recursive: true, force: true });
  });
});

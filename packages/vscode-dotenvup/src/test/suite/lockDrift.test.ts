/**
 * Lock command: ensure Lock updates .env.up from disk (or from buffer when dirty)
 * and deletes .env. Covers confirm dialog, cancel, and lock-from-buffer with warning.
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
  test('Lock with drift updates .env.up from disk and deletes .env after confirm', async function () {
    if (!format) {
      this.skip();
      return;
    }
    const dir = await createTempDir();
    const { publicKey, privateKey } = await format.generateKeypair();
    await writeEnvUp(dir, { A: '1' }, publicKey);
    await fs.writeFile(path.join(dir, '.env'), 'A=1\nB=2', 'utf8');

    const origShowInfo = vscode.window.showInformationMessage;
    (vscode.window as { showInformationMessage: (msg: string, ...items: string[]) => Thenable<string | undefined> })
      .showInformationMessage = (_msg: string, ...items: string[]) => Promise.resolve(items[0]);
    const origGetConfig = vscode.workspace.getConfiguration;
    (vscode.workspace as {
      getConfiguration: (section?: string, scope?: vscode.ConfigurationScope | null) => vscode.WorkspaceConfiguration;
    }).getConfiguration = (section?: string) =>
      ({
        get: (key: string, defaultValue?: boolean) => {
          if (section !== 'dotenvup') return defaultValue;
          if (key === 'confirmOnLock') return false;
          if (key === 'createBackupBeforeLock') return false;
          return defaultValue;
        },
        update: async () => {},
      }) as unknown as vscode.WorkspaceConfiguration;

    const mockKeystore = {
      getPrivateKey: () => Promise.resolve(privateKey),
      getPublicKey: () => Promise.resolve(publicKey),
      getIdentityDir: () => dir,
    } as unknown as ExtensionKeyStore;

    try {
      await lockCmd.run(mockKeystore, dir);
    } finally {
      (vscode.window as { showInformationMessage: (msg: string, ...items: string[]) => Thenable<string | undefined> })
        .showInformationMessage = origShowInfo;
      (vscode.workspace as {
        getConfiguration: (section?: string, scope?: vscode.ConfigurationScope | null) => vscode.WorkspaceConfiguration;
      }).getConfiguration = origGetConfig;
    }

    await assert.rejects(fs.access(path.join(dir, '.env')), '.env must be removed after lock');
    const envUpContent = await fs.readFile(path.join(dir, '.env.up'), 'utf8');
    const file = format!.parse(envUpContent);
    const { entries } = await format!.decryptAny(file, privateKey, '@local');
    assert.strictEqual(entries.A, '1');
    assert.strictEqual(entries.B, '2', '.env.up must have B after lock');

    await fs.rm(dir, { recursive: true, force: true });
  });

  test('Lock updates .env.up from disk and deletes .env (changes preserved)', async function () {
    if (!format) {
      this.skip();
      return;
    }
    const dir = await createTempDir();
    const { publicKey, privateKey } = await format.generateKeypair();
    await writeEnvUp(dir, { A: '1' }, publicKey);
    await fs.writeFile(path.join(dir, '.env'), 'A=1\nB=2', 'utf8');

    const origGetConfig = vscode.workspace.getConfiguration;
    (vscode.workspace as {
      getConfiguration: (section?: string, scope?: vscode.ConfigurationScope | null) => vscode.WorkspaceConfiguration;
    }).getConfiguration = (section?: string) =>
      ({
        get: (key: string, defaultValue?: boolean) => {
          if (section !== 'dotenvup') return defaultValue;
          if (key === 'confirmOnLock') return false;
          if (key === 'createBackupBeforeLock') return false;
          return defaultValue;
        },
        update: async () => {},
      }) as unknown as vscode.WorkspaceConfiguration;

    const mockKeystore = {
      getPrivateKey: () => Promise.resolve(privateKey),
      getPublicKey: () => Promise.resolve(publicKey),
      getIdentityDir: () => dir,
    } as unknown as ExtensionKeyStore;

    try {
      await lockCmd.run(mockKeystore, dir);
    } finally {
      (vscode.workspace as {
        getConfiguration: (section?: string, scope?: vscode.ConfigurationScope | null) => vscode.WorkspaceConfiguration;
      }).getConfiguration = origGetConfig;
    }

    await assert.rejects(fs.access(path.join(dir, '.env')), '.env must be removed after lock');
    const envUpContent = await fs.readFile(path.join(dir, '.env.up'), 'utf8');
    const file = format!.parse(envUpContent);
    const { entries } = await format!.decryptAny(file, privateKey, '@local');
    assert.strictEqual(entries.A, '1');
    assert.strictEqual(entries.B, '2', 'new key B must be in .env.up after lock');

    await fs.rm(dir, { recursive: true, force: true });
  });

  test('Cancel on confirm leaves .env and .env.up unchanged', async function () {
    if (!format) {
      this.skip();
      return;
    }
    const dir = await createTempDir();
    const { publicKey, privateKey } = await format.generateKeypair();
    await writeEnvUp(dir, { A: '1' }, publicKey);
    await fs.writeFile(path.join(dir, '.env'), 'A=1\nB=2', 'utf8');

    const origShowInfo = vscode.window.showInformationMessage;
    (vscode.window as { showInformationMessage: (msg: string, ...items: string[]) => Thenable<string | undefined> })
      .showInformationMessage = () => Promise.resolve(undefined);

    const mockKeystore = {
      getPrivateKey: () => Promise.resolve(privateKey),
      getPublicKey: () => Promise.resolve(publicKey),
      getIdentityDir: () => dir,
    } as unknown as ExtensionKeyStore;

    try {
      await lockCmd.run(mockKeystore, dir);
    } finally {
      (vscode.window as { showInformationMessage: (msg: string, ...items: string[]) => Thenable<string | undefined> })
        .showInformationMessage = origShowInfo;
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

  test('Lock from buffer (dirty): warning then persist buffer to .env.up and delete .env', async function () {
    if (!format) {
      this.skip();
      return;
    }
    const dir = await createTempDir();
    const { publicKey, privateKey } = await format.generateKeypair();
    await writeEnvUp(dir, { A: '1' }, publicKey);
    const envPath = path.join(dir, '.env');
    await fs.writeFile(envPath, 'A=1', 'utf8');

    const uri = vscode.Uri.file(envPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    const edit = new vscode.WorkspaceEdit();
    const start = new vscode.Position(0, 0);
    const end =
      doc.lineCount > 0
        ? new vscode.Position(doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length)
        : start;
    edit.replace(uri, new vscode.Range(start, end), 'A=1\nB=2');
    await vscode.workspace.applyEdit(edit);

    const origShowWarning = vscode.window.showWarningMessage;
    (vscode.window as { showWarningMessage: (msg: string, ...items: string[]) => Thenable<string | undefined> })
      .showWarningMessage = (_msg: string, ...items: string[]) => Promise.resolve(items[0]);

    const origGetConfig = vscode.workspace.getConfiguration;
    (vscode.workspace as {
      getConfiguration: (section?: string, scope?: vscode.ConfigurationScope | null) => vscode.WorkspaceConfiguration;
    }).getConfiguration = (section?: string) =>
      ({
        get: (key: string, defaultValue?: boolean) => {
          if (section !== 'dotenvup') return defaultValue;
          if (key === 'createBackupBeforeLock') return false;
          return defaultValue;
        },
        update: async () => {},
      }) as unknown as vscode.WorkspaceConfiguration;

    const mockKeystore = {
      getPrivateKey: () => Promise.resolve(privateKey),
      getPublicKey: () => Promise.resolve(publicKey),
      getIdentityDir: () => dir,
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

    await assert.rejects(fs.access(envPath), '.env must be removed after lock from buffer');
    const envUpContent = await fs.readFile(path.join(dir, '.env.up'), 'utf8');
    const file = format!.parse(envUpContent);
    const { entries } = await format!.decryptAny(file, privateKey, '@local');
    assert.strictEqual(entries.A, '1');
    assert.strictEqual(entries.B, '2', 'buffer content B must be in .env.up after lock from buffer');

    await fs.rm(dir, { recursive: true, force: true });
  });
});

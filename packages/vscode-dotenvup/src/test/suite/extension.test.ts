/**
 * DotEnvUp extension tests
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('DotEnvUp Extension Test Suite', () => {
  test('Extension should be present', () => {
    const ext = vscode.extensions.getExtension('dotenvup.dotenvup');
    assert.ok(ext);
  });

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('dotenvup.dotenvup');
    if (ext) {
      await ext.activate();
      assert.strictEqual(ext.isActive, true);
    }
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('dotenvup.lock'));
    assert.ok(commands.includes('dotenvup.unlock'));
    assert.ok(commands.includes('dotenvup.import'));
    assert.ok(commands.includes('dotenvup.showKeys'));
    assert.ok(commands.includes('dotenvup.status'));
    assert.ok(commands.includes('dotenvup.init'));
    assert.ok(commands.includes('dotenvup.toggleLock'));
    assert.ok(commands.includes('dotenvup.keyManagement'));
    assert.ok(commands.includes('dotenvup.keyExport'));
    assert.ok(commands.includes('dotenvup.keyImport'));
    assert.ok(commands.includes('dotenvup.keyStorageStatus'));
    assert.ok(commands.includes('dotenvup.recoverKeyMismatch'));
    assert.ok(commands.includes('dotenvup.recipientsList'));
    assert.ok(commands.includes('dotenvup.recipientsAdd'));
    assert.ok(commands.includes('dotenvup.recipientsRemove'));
    assert.ok(commands.includes('dotenvup.recipientsDiscover'));
  });
});

/**
 * Command execution tests (error paths when no workspace / no .env.up)
 *
 * Critical: dotenvup.toggleLock when workspace has only .env (no .env.up) must
 * show the First Protect webview (or QuickPick for folder selection) and then
 * run the protect flow. These tests ensure the command is registered and
 * runnable in all cases without hanging or throwing.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Commands', () => {
  test('dotenvup.status can be executed', async () => {
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand('dotenvup.status');
    });
  });

  test('dotenvup.showKeys can be executed', async () => {
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand('dotenvup.showKeys');
    });
  });

  test('dotenvup.lock and dotenvup.unlock are registered', async () => {
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('dotenvup.lock'));
    assert.ok(commands.includes('dotenvup.unlock'));
    assert.ok(commands.includes('dotenvup.keyManagement'));
    assert.ok(commands.includes('dotenvup.recoverKeyMismatch'));
    assert.ok(commands.includes('dotenvup.recipientsList'));
    assert.ok(commands.includes('dotenvup.recipientsAdd'));
    assert.ok(commands.includes('dotenvup.recipientsRemove'));
    assert.ok(commands.includes('dotenvup.recipientsDiscover'));
    assert.ok(commands.includes('dotenvup.receiveShare'));
    assert.ok(commands.includes('dotenvup.copyMcpConfig'));
    assert.ok(commands.includes('dotenvup.encryptForGitHub'));
    assert.ok(commands.includes('dotenvup.decryptSealed'));
  });

  test('dotenvup.toggleLock is registered', async () => {
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes('dotenvup.toggleLock'), 'status bar click runs this');
  });

  test('dotenvup.toggleLock executes without throwing (no .env.up path)', async () => {
    // Stub QuickPick and WebviewPanel to prevent hanging in test environment
    const origQuickPick = vscode.window.showQuickPick;
    const origCreateWebview = vscode.window.createWebviewPanel;

    (vscode.window as { showQuickPick: typeof origQuickPick }).showQuickPick = () =>
      Promise.resolve(undefined);
    (vscode.window as { createWebviewPanel: typeof origCreateWebview }).createWebviewPanel =
      (..._args: Parameters<typeof origCreateWebview>) => {
        // Return a mock panel that immediately resolves with cancel
        const disposables: vscode.Disposable[] = [];
        let messageHandler: ((msg: { command: string }) => void) | undefined;
        const panel = {
          webview: {
            html: '',
            onDidReceiveMessage: (handler: (msg: { command: string }) => void) => {
              messageHandler = handler;
              // Simulate user clicking cancel
              setTimeout(() => messageHandler?.({ command: 'cancel' }), 10);
              return { dispose: () => {} };
            },
          },
          onDidDispose: (handler: () => void) => {
            disposables.push({ dispose: handler });
            return { dispose: () => {} };
          },
          dispose: () => disposables.forEach((d) => d.dispose()),
        };
        return panel as unknown as vscode.WebviewPanel;
      };

    try {
      await assert.doesNotReject(
        () => Promise.resolve(vscode.commands.executeCommand('dotenvup.toggleLock')),
        'toggleLock must not throw when workspace has no .env.up',
      );
    } finally {
      (vscode.window as { showQuickPick: typeof origQuickPick }).showQuickPick = origQuickPick;
      (vscode.window as { createWebviewPanel: typeof origCreateWebview }).createWebviewPanel = origCreateWebview;
    }
  });
});

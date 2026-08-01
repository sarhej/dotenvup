/**
 * DotEnvUp: Safe Edit Command
 *
 * Opens a virtual document `dotenvup-safe:/path/to/.env` backed by the real `.env.up`.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as logger from '../logger';
import type { ExtensionKeyStore } from '../keystore';

function isKeyMismatchError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /encrypted with a different key/i.test(msg) ||
    /No recipient block could be decrypted|incorrect key pair for the given ciphertext/i.test(msg)
  );
}

export async function run(uri?: vscode.Uri, keystore?: ExtensionKeyStore): Promise<void> {
  if (!uri) {
    // If no URI provided (e.g. from command palette), try active editor
    const active = vscode.window.activeTextEditor;
    if (active && active.document.fileName.endsWith('.env.up')) {
      uri = active.document.uri;
    } else {
      // Fallback: ask user to pick a .env.up file?
      // For now, just error if context is missing.
      logger.error('DotEnvUp: No .env.up file selected for Safe Edit.');
      vscode.window.showErrorMessage('DotEnvUp: Open a .env.up file first, or pick one from the status bar.');
      return;
    }
  }

  const envUpPath = uri.fsPath;
  const dir = path.dirname(envUpPath);
  const envPath = path.join(dir, '.env');

  let mergeQuery: string | undefined;
  try {
    await fs.access(envPath);
    const choice = await vscode.window.showQuickPick(
      [
        { label: 'Yes, prefer .env', value: 'env' },
        { label: 'Yes, prefer .env.up', value: 'envUp' },
        { label: 'No, use .env.up only', value: 'none' },
      ],
      {
        placeHolder: 'Merge with .env?',
        title: 'DotEnvUp: Safe Edit',
      }
    );
    if (choice?.value && choice.value !== 'none') {
      mergeQuery = `merge=${choice.value}`;
    }
  } catch {
    // .env does not exist
  }

  try {
    let virtualUri = vscode.Uri.from({
      scheme: 'dotenvup-safe',
      path: path.join(dir, '.env.up.edit'),
    });
    if (mergeQuery) {
      virtualUri = virtualUri.with({ query: mergeQuery });
    }

    const doc = await vscode.workspace.openTextDocument(virtualUri);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch (error) {
    logger.error(`DotEnvUp: Failed to open Safe Edit: ${error}`);
    const msg = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : '';
    if (isKeyMismatchError(error) && keystore) {
      const choice = await vscode.window.showErrorMessage(
        'DotEnvUp: Safe Edit failed — this .env.up was encrypted with a different key than the one in use. ' +
          'Run Recover key mismatch to import the correct key, or clear UP_KEY / DOTENVUP_IDENTITY_DIR if you use ~/.dotenvup.',
        'Recover key mismatch',
        'Dismiss',
      );
      if (choice === 'Recover key mismatch') {
        const recovery = await import('./recoverKeyMismatch');
        await recovery.run(keystore, { envUpPath, sourceAction: 'manual' });
      }
      return;
    }
    if (
      name === 'AuthCancelledError' ||
      /Authentication cancelled/i.test(msg)
    ) {
      vscode.window.showErrorMessage(
        'DotEnvUp: Safe Edit cancelled — approve Touch ID / password, or run `up run -- true` in a terminal to warm the session first.',
      );
      return;
    }
    if (
      name === 'NonInteractiveKeychainError' ||
      /session is locked/i.test(msg) ||
      /DOTENVUP_NO_PROMPT/i.test(msg)
    ) {
      vscode.window.showErrorMessage(
        'DotEnvUp: Safe Edit needs Keychain unlock. Run `up run -- true` in Terminal (Touch ID), then retry Safe Edit — or update the extension to a build that includes Keychain support.',
      );
      return;
    }
    if (/No private key|keychain helper is not available|wrap\.source/i.test(msg)) {
      vscode.window.showErrorMessage(
        'DotEnvUp: Safe Edit cannot read a Keychain-backed identity. Install a DotEnvUp build that includes `@dotenvup/keychain` (or warm a session with `up run -- true` after updating the extension).',
      );
      return;
    }
    vscode.window.showErrorMessage(`DotEnvUp: Failed to open Safe Edit. ${msg}`);
  }
}

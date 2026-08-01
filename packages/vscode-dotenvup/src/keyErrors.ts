/**
 * Map Keychain / session errors to user-facing extension messages.
 */

import * as vscode from 'vscode';
import type { ExtensionKeyStore } from './keystore';

export function isAuthCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  const msg = error instanceof Error ? error.message : String(error);
  return name === 'AuthCancelledError' || /Authentication cancelled/i.test(msg);
}

export function isSessionLocked(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    name === 'NonInteractiveKeychainError' ||
    /session is locked/i.test(msg) ||
    /DOTENVUP_NO_PROMPT/i.test(msg)
  );
}

/** Show a toast for key-load failures; returns true if handled. */
export function showKeyLoadError(error: unknown, action: string): boolean {
  if (isAuthCancelled(error)) {
    void vscode.window.showErrorMessage(
      `DotEnvUp: ${action} cancelled — approve Touch ID / password, or run \`up run -- true\` in Terminal to warm the session first.`,
    );
    return true;
  }
  if (isSessionLocked(error)) {
    void vscode.window.showErrorMessage(
      `DotEnvUp: ${action} needs Keychain unlock. Run \`up run -- true\` (Touch ID), then retry. Use extension ≥0.6.4 (or a local VSIX with the Keychain helper).`,
    );
    return true;
  }
  return false;
}

export const KEYCHAIN_NO_KEY_HINT =
  'DotEnvUp: Cannot unlock a Keychain-backed identity. Install the latest DotEnvUp VSIX (with Keychain helper), run `up run -- true` to warm the session, then retry. Do not run Init — that would create a new Key-Id.';

/**
 * Load private key or show a toast and return null (for command handlers).
 */
export async function requirePrivateKeyOrNotify(
  keystore: ExtensionKeyStore,
  action: string,
): Promise<Uint8Array | null> {
  try {
    return await keystore.requirePrivateKey();
  } catch (err) {
    if (showKeyLoadError(err, action)) return null;
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(msg);
    return null;
  }
}

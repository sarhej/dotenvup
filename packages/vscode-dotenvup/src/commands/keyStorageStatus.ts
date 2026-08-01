import * as path from 'path';
import * as vscode from 'vscode';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';

export async function run(keystore: ExtensionKeyStore): Promise<void> {
  const config = vscode.workspace.getConfiguration('dotenvup');
  const modeSetting = config.get<string>('keyStorageMode', 'user-file');
  const identityDir = keystore.getIdentityDir();
  const hasKeypair = await keystore.hasKeypair();

  let storageMode = 'unknown';
  let sessionLine = 'Session: (unavailable)';
  try {
    const { detectKeyStorageMode, sessionStatus } = await import('@dotenvup/format');
    storageMode = await detectKeyStorageMode(identityDir);
    const st = await sessionStatus();
    sessionLine = st.active
      ? `Session: warm (idle remaining ~${Math.round((st.idleMsLeft ?? 0) / 1000)}s)`
      : 'Session: cold (next decrypt may prompt Touch ID / password)';
  } catch {
    // format helpers may fail on older installs
  }

  logger.info(
    [
      'DotEnvUp Key Storage',
      `Setting keyStorageMode: ${modeSetting}`,
      `Detected storage: ${storageMode}`,
      `Identity dir: ${identityDir}`,
      `Envelope: ${path.join(identityDir, 'identity.enc')}`,
      `Public key: ${path.join(identityDir, 'identity.pub')}`,
      `Legacy plaintext (if present): ${path.join(identityDir, 'identity')}`,
      `Keypair: ${hasKeypair ? 'configured' : 'not configured'}`,
      sessionLine,
      'Opt-in Keychain: `up key upgrade` then `up key migrate-to-keychain`.',
      'Warm session: `up run -- true` then Safe Edit / Unlock.',
      'Do not run Init if you already have a Key-Id — that creates a new identity.',
    ].join('\n'),
  );
}

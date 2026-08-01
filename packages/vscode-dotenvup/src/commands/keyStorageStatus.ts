import * as path from 'path';
import * as vscode from 'vscode';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';

export async function run(keystore: ExtensionKeyStore): Promise<void> {
  const config = vscode.workspace.getConfiguration('dotenvup');
  const mode = config.get<string>('keyStorageMode', 'user-file');
  const identityDir = keystore.getIdentityDir();
  const hasKeypair = await keystore.hasKeypair();

  logger.info(
    [
      'DotEnvUp Key Storage',
      `Mode: ${mode}`,
      `Identity dir: ${identityDir}`,
      `Envelope (current): ${path.join(identityDir, 'identity.enc')} + wrapping-key`,
      `Public key: ${path.join(identityDir, 'identity.pub')}`,
      `Legacy plaintext (if present): ${path.join(identityDir, 'identity')}`,
      `Keypair: ${hasKeypair ? 'configured' : 'not configured'}`,
      'Tip: CLI `up key upgrade` migrates legacy plaintext (same Key-Id). Touch ID is not shipped yet.',
    ].join('\n'),
  );
}

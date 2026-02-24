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
      `Private key: ${path.join(identityDir, 'identity')} (mode 0600)`,
      `Public key: ${path.join(identityDir, 'identity.pub')}`,
      `Keypair: ${hasKeypair ? 'configured' : 'not configured'}`,
    ].join('\n'),
  );
}


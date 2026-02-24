/**
 * DotEnvUp: Init — Generate keypair, store via KeyStore (~/.dotenvup/identity)
 */

import * as vscode from 'vscode';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';

const DEFAULT_RECIPIENT = '@local';

export async function run(keystore: ExtensionKeyStore): Promise<void> {
  const hasKeys = await keystore.hasKeypair();
  if (hasKeys) {
    const overwrite = await vscode.window.showWarningMessage(
      'Keypair already exists. Overwrite?',
      'Overwrite',
      'Cancel',
    );
    if (overwrite !== 'Overwrite') return;
  }

  const { generateKeypair } = await import('@dotenvup/format');
  const { publicKey, privateKey } = await generateKeypair();
  await keystore.storeKeypair(publicKey, privateKey);

  const pubB64 = Buffer.from(publicKey).toString('base64');
  const fingerprint = pubB64.slice(0, 16) + '...';

  logger.info(`DotEnvUp: Keypair created. Fingerprint: ${fingerprint}. Recipient: ${DEFAULT_RECIPIENT}`);
}

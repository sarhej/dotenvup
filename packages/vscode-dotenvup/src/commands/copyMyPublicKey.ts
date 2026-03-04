import * as vscode from 'vscode';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';

export async function run(keystore: ExtensionKeyStore): Promise<void> {
  const publicKey = await keystore.getPublicKey();
  if (!publicKey) {
    logger.error('DotEnvUp: No keypair found. Run "DotEnvUp: Init" first.');
    return;
  }

  const base64 = Buffer.from(publicKey).toString('base64');
  const { keyFingerprint } = await import('@dotenvup/format');
  const fingerprint = await keyFingerprint(publicKey);

  await vscode.env.clipboard.writeText(base64);
  vscode.window.showInformationMessage(
    `DotEnvUp: Public key copied to clipboard. Key ID: ${fingerprint} — share it with your teammate so they can encrypt for you.`,
  );
}

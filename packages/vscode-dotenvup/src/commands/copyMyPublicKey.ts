import * as vscode from 'vscode';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';

export async function run(keystore: ExtensionKeyStore): Promise<void> {
  const publicKey = await keystore.getPublicKey();
  if (!publicKey) {
    logger.error(
      'DotEnvUp: No public key (identity.pub) found. If you use Keychain, the public key should still be on disk. Run "DotEnvUp: Init" only if you have never set up a key.',
    );
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

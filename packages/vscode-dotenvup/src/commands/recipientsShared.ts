import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

function decodePublicKeyBase64(base64: string): Uint8Array {
  const pub = new Uint8Array(Buffer.from(base64.trim(), 'base64'));
  if (pub.length !== 32) {
    throw new Error('Public key must decode to 32 bytes.');
  }
  return pub;
}

export async function parseRecipientPublicKeyInput(valueOrPath: string): Promise<Uint8Array> {
  const maybePath = path.resolve(valueOrPath);
  try {
    const stat = await fs.stat(maybePath);
    if (stat.isFile()) {
      const raw = (await fs.readFile(maybePath, 'utf8')).trim();
      if (raw.startsWith('{')) {
        const { parseKeyBundle } = await import('@dotenvup/format');
        const bundle = parseKeyBundle(raw);
        return decodePublicKeyBase64(bundle.publicKey);
      }
      return decodePublicKeyBase64(raw);
    }
  } catch {
    // fall through: treat input as base64
  }
  return decodePublicKeyBase64(valueOrPath);
}

export async function askRecipientSource(): Promise<string | null> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: 'Paste public key (base64)', value: 'paste' },
      { label: 'Select key file (.pub / .dotenvup-key)', value: 'file' },
    ],
    { title: 'DotEnvUp: Add recipient', placeHolder: 'Choose recipient key source' },
  );
  if (!pick) return null;
  if (pick.value === 'paste') {
    const raw = await vscode.window.showInputBox({
      title: 'DotEnvUp: Recipient public key',
      prompt: 'Paste recipient public key (base64, 32-byte key)',
      ignoreFocusOut: true,
    });
    return raw ?? null;
  }
  const open = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Select recipient key file',
    filters: { 'Key files': ['pub', 'dotenvup-key', 'json', 'keybundle'], All: ['*'] },
  });
  return open?.[0]?.fsPath ?? null;
}


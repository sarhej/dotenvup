/**
 * DotEnvUp: Receive Encrypted Share
 *
 * Decrypts an UnknownPassword share link. Supports both:
 * - AES-GCM shares (Approach A): key is in the URL fragment
 * - X25519 sealed-box shares (Approach B): decrypted with local DotEnvUp private key
 */

import * as vscode from 'vscode';
import { webcrypto } from 'crypto';
import type { ExtensionKeyStore } from '../keystore';

const API_ORIGIN = 'https://unknownpassword.com';
const SHARE_URL_PATTERN = /\/s\/(UP-[A-Za-z0-9_-]+)(?:#(.+))?$/;

function base64UrlToBuf(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}

async function decryptAesGcm(ciphertext: string, keyB64: string): Promise<string> {
  const crypto = webcrypto as unknown as Crypto;
  const combined = base64UrlToBuf(ciphertext);
  const rawKey = base64UrlToBuf(keyB64);
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const key = await crypto.subtle.importKey('raw', rawKey.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

interface ShareResponse {
  encrypted_payload?: string;
  encryption_type?: string;
  recipient_github?: string;
  error?: string;
  requires_auth?: boolean;
}

function parseShareUrl(input: string): { id: string; key?: string } | null {
  const match = input.match(SHARE_URL_PATTERN);
  if (!match) return null;
  return { id: match[1], key: match[2] || undefined };
}

function countKeys(envContent: string): string[] {
  return envContent
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => l.split('=')[0].trim());
}

export async function run(keystore: ExtensionKeyStore): Promise<void> {
  const input = await vscode.window.showInputBox({
    prompt: 'Paste the UnknownPassword share link',
    placeHolder: 'https://unknownpassword.com/s/UP-xxxxxxxx#...',
    ignoreFocusOut: true,
  });
  if (!input) return;

  const parsed = parseShareUrl(input);
  if (!parsed) {
    vscode.window.showErrorMessage('DotEnvUp: Invalid share link format.');
    return;
  }

  try {
    const res = await fetch(`${API_ORIGIN}/api/shares/${parsed.id}`);
    const data = (await res.json()) as ShareResponse;

    if (res.status === 401 && data.requires_auth && data.recipient_github) {
      vscode.window.showErrorMessage(
        `DotEnvUp: This share is locked to @${data.recipient_github}. Authentication required — open the link in your browser to claim it.`,
      );
      return;
    }

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    if (!data.encrypted_payload) {
      throw new Error('No encrypted payload in response');
    }

    let decrypted: string;

    if (data.encryption_type === 'x25519-sealed') {
      const { sealedShareDecrypt } = await import('@dotenvup/format');
      const pubKey = await keystore.getPublicKey();
      const { requirePrivateKeyOrNotify } = await import('../keyErrors');
      const privKey = await requirePrivateKeyOrNotify(keystore, 'Receive Share');
      if (!pubKey || !privKey) {
        if (!pubKey) {
          const action = await vscode.window.showErrorMessage(
            'DotEnvUp: No public key found. This share requires your private key to decrypt. Run Init only if you have never set up a key.',
            'Init keypair',
          );
          if (action === 'Init keypair') {
            await vscode.commands.executeCommand('dotenvup.init');
          }
        }
        return;
      }

      // DotEnvUp keys are X25519 already (crypto_box_keypair), so use them directly.
      // If in the future we support SSH Ed25519 keys, we'd convert here.
      try {
        decrypted = await sealedShareDecrypt(
          data.encrypted_payload,
          pubKey,
          privKey,
        );
      } catch {
        // Maybe the sender encrypted for our SSH Ed25519 key, not our DotEnvUp X25519 key.
        // Try loading and converting SSH keys as a fallback.
        vscode.window.showErrorMessage(
          'DotEnvUp: Could not decrypt this share with your current key. ' +
          'The sender may have encrypted for a different key (e.g. your GitHub SSH Ed25519 key). ' +
          'SSH key decryption support is coming soon.',
        );
        return;
      }
    } else {
      // AES-GCM (Approach A or blind share)
      if (!parsed.key) {
        vscode.window.showErrorMessage('DotEnvUp: This is an AES-GCM share but the decryption key is missing from the URL.');
        return;
      }
      decrypted = await decryptAesGcm(data.encrypted_payload, parsed.key);
    }

    const keys = countKeys(decrypted);
    const keyPreview = keys.length > 5
      ? `${keys.slice(0, 5).join(', ')}... (+${keys.length - 5} more)`
      : keys.join(', ');

    const action = await vscode.window.showQuickPick(
      [
        { label: 'Merge into .env', detail: `Add/update ${keys.length} key(s): ${keyPreview}`, action: 'merge' as const },
        { label: 'Overwrite .env', detail: 'Replace .env entirely with received secrets', action: 'overwrite' as const },
        { label: 'Show preview', detail: 'View the decrypted content first', action: 'preview' as const },
        { label: 'Cancel', detail: '', action: 'cancel' as const },
      ],
      { placeHolder: `Received ${keys.length} secret(s). What would you like to do?` },
    );
    if (!action || action.action === 'cancel') return;

    if (action.action === 'preview') {
      const doc = await vscode.workspace.openTextDocument({ content: decrypted, language: 'dotenv' });
      await vscode.window.showTextDocument(doc, { preview: true });
      return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open. Open a folder first.');
      return;
    }

    const targetFolder = workspaceFolders[0].uri;
    const envPath = vscode.Uri.joinPath(targetFolder, '.env');

    if (action.action === 'overwrite') {
      await vscode.workspace.fs.writeFile(envPath, new TextEncoder().encode(decrypted));
      vscode.window.showInformationMessage(`DotEnvUp: .env written with ${keys.length} secret(s).`);
      return;
    }

    // merge
    let existing = '';
    try {
      const raw = await vscode.workspace.fs.readFile(envPath);
      existing = new TextDecoder().decode(raw);
    } catch { /* file doesn't exist yet */ }

    const merged = mergeEnv(existing, decrypted);
    await vscode.workspace.fs.writeFile(envPath, new TextEncoder().encode(merged));
    vscode.window.showInformationMessage(`DotEnvUp: Merged ${keys.length} secret(s) into .env.`);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`DotEnvUp: Failed to receive share — ${msg}`);
  }
}

function mergeEnv(existing: string, incoming: string): string {
  const existingLines = existing.split('\n');
  const incomingPairs = new Map<string, string>();

  for (const line of incoming.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    incomingPairs.set(trimmed.substring(0, eq).trim(), trimmed.substring(eq + 1));
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of existingLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const key = trimmed.substring(0, trimmed.indexOf('=')).trim();
      if (incomingPairs.has(key)) {
        result.push(`${key}=${incomingPairs.get(key)}`);
        seen.add(key);
        continue;
      }
    }
    result.push(line);
  }

  for (const [key, value] of incomingPairs) {
    if (!seen.has(key)) {
      result.push(`${key}=${value}`);
    }
  }

  return result.join('\n');
}

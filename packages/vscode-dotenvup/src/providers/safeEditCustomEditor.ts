/**
 * Custom editor provider for .env.up — "Open With" → DotEnvUp Safe Edit.
 * Shows decrypted content in a webview; on save, re-encrypts and writes to the file.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { ExtensionKeyStore } from '../keystore';
import { getAuthor } from '../author';

const VIEW_TYPE = 'dotenvup.safeEdit';

function escapeHtml(html: string): string {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getWebviewContent(plaintext: string): string {
  const nonce = crypto.randomBytes(16).toString('base64');
  const body = escapeHtml(plaintext);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <style>
    body { margin: 0; padding: 8px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
    textarea { width: 100%; min-height: 80vh; box-sizing: border-box; padding: 8px; resize: vertical;
               background: var(--vscode-editor-background); color: var(--vscode-editor-foreground);
               border: 1px solid var(--vscode-input-border); }
  </style>
</head>
<body>
  <textarea id="content" placeholder="Decrypted .env content…">${body}</textarea>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const ta = document.getElementById('content');
    ta.addEventListener('input', () => { vscode.postMessage({ type: 'dirty' }); });
    window.addEventListener('message', (e) => {
      if (e.data === 'pleaseSave') vscode.postMessage({ type: 'save', content: ta.value });
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        vscode.postMessage({ type: 'save', content: ta.value });
      }
    });
  </script>
</body>
</html>`;
}

const openPanels = new Map<string, vscode.WebviewPanel>();
const pendingSave = new Map<string, () => void>();

export class SafeEditCustomEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private keystore: ExtensionKeyStore) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };

    const updateWebview = (plaintext: string) => {
      webviewPanel.webview.html = getWebviewContent(plaintext);
    };

    const decrypt = async (): Promise<string> => {
      const content = document.getText();
      const { parse, decryptAny } = await import('@dotenvup/format');
      const privateKey = await this.keystore.getPrivateKey();
      if (!privateKey) {
        return '# No private key. Run DotEnvUp: Init first.';
      }
      const file = parse(content);
      const result = await decryptAny(file, privateKey, '@local');
      return Object.entries(result.entries)
        .map(([k, v]) => `${k}="${v}"`)
        .join('\n');
    };

    let plaintext: string;
    try {
      plaintext = await decrypt();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      plaintext = `# Decryption failed: ${msg}\n# Run DotEnvUp: Recover key mismatch if the key is wrong.`;
    }
    updateWebview(plaintext);

    const docKey = document.uri.toString();
    openPanels.set(docKey, webviewPanel);
    webviewPanel.onDidDispose(() => {
      openPanels.delete(docKey);
      pendingSave.delete(docKey);
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: { type: string; content?: string }) => {
      if (message.type === 'save' && message.content !== undefined) {
        const newPlaintext = message.content;
        try {
          const { create, serialize, parseEnvFile } = await import('@dotenvup/format');
          const privateKey = await this.keystore.getPrivateKey();
          const publicKey = await this.keystore.getPublicKey();
          if (!privateKey || !publicKey) {
            vscode.window.showErrorMessage('DotEnvUp: No keypair. Run DotEnvUp: Init first.');
            return;
          }
          const author = await getAuthor(this.keystore.getIdentityDir());
          const recipients = new Map<string, Uint8Array>();
          recipients.set(author, publicKey);
          const newEntries = parseEnvFile(newPlaintext);
          const newFile = await create(newEntries, author, recipients, newPlaintext);
          const encrypted = serialize(newFile);

          const edit = new vscode.WorkspaceEdit();
          const fullRange = new vscode.Range(0, 0, document.lineCount, 0);
          edit.replace(document.uri, fullRange, encrypted);
          const applied = await vscode.workspace.applyEdit(edit);
          if (applied) {
            await document.save();
          }
          const resolve = pendingSave.get(docKey);
          if (resolve) {
            pendingSave.delete(docKey);
            resolve();
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`DotEnvUp: Save failed. ${msg}`);
          const resolve = pendingSave.get(docKey);
          if (resolve) {
            pendingSave.delete(docKey);
            resolve();
          }
        }
      }
    });
  }
}

export function getOpenPanelForDocument(uri: vscode.Uri): vscode.WebviewPanel | undefined {
  return openPanels.get(uri.toString());
}

export function requestSaveAndWait(uri: vscode.Uri): Promise<void> {
  const panel = openPanels.get(uri.toString());
  if (!panel) return Promise.resolve();
  return new Promise((resolve) => {
    const key = uri.toString();
    const timeout = setTimeout(() => {
      if (pendingSave.delete(key)) resolve();
    }, 5000);
    pendingSave.set(key, () => {
      clearTimeout(timeout);
      pendingSave.delete(key);
      resolve();
    });
    panel.webview.postMessage('pleaseSave');
  });
}

export function registerSafeEditCustomEditor(
  context: vscode.ExtensionContext,
  keystore: ExtensionKeyStore,
): void {
  const provider = new SafeEditCustomEditorProvider(keystore);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((e) => {
      const panel = getOpenPanelForDocument(e.document.uri);
      if (!panel || e.document.uri.scheme !== 'file' || !e.document.fileName.endsWith('.env.up')) return;
      e.waitUntil(requestSaveAndWait(e.document.uri));
    }),
  );
}

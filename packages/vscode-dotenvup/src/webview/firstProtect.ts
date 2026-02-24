/**
 * First Protect Webview — consent popup shown before first keypair generation.
 *
 * Explains what will happen, where the key is stored, the local-only warning,
 * and subtly promotes UnknownPassword for team sharing + key backup.
 *
 * Shown once (first protect). After user clicks "Protect My .env", the protect
 * flow runs and the popup is never shown again.
 */

import * as vscode from 'vscode';

export interface FirstProtectResult {
  action: 'protect' | 'cancel';
  /** Optional nickname for Encrypted-By in .env.up (e.g. your name); empty = @local */
  nickname?: string;
}

/**
 * Show the First Protect webview panel and wait for user's decision.
 * Returns 'protect' if user clicked "Protect My .env", or 'cancel' otherwise.
 */
export function showFirstProtectPanel(
  context: vscode.ExtensionContext,
  identityDir: string,
): Promise<FirstProtectResult> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      'dotenvup.firstProtect',
      'DotEnvUp — Protect Your Secrets',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
      },
    );

    let resolved = false;

    panel.webview.html = getWebviewContent(identityDir);

    panel.webview.onDidReceiveMessage(
      (message: { command: string; nickname?: string }) => {
        if (resolved) return;
        resolved = true;
        panel.dispose();
        if (message.command === 'protect') {
          resolve({ action: 'protect', nickname: message.nickname?.trim() || undefined });
        } else {
          resolve({ action: 'cancel' });
        }
      },
      undefined,
      context.subscriptions,
    );

    panel.onDidDispose(() => {
      if (!resolved) {
        resolved = true;
        resolve({ action: 'cancel' });
      }
    });
  });
}

function getWebviewContent(identityDir: string): string {
  const escapedDir = identityDir.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Protect Your Secrets</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--vscode-editor-background, #1e1e2e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      padding: 0;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding-top: 24px;
    }
    .container {
      max-width: 520px;
      width: 100%;
      background: var(--vscode-editorWidget-background, #ffffff);
      border: 1px solid var(--vscode-editorWidget-border, #e5e7eb);
      border-radius: 8px;
      overflow: hidden;
    }
    .header {
      background: #6366f1;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header svg { flex-shrink: 0; }
    .header h1 {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      margin: 0;
    }
    .body { padding: 24px; }
    .section {
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-editor-foreground, #1a1a2e);
      margin-bottom: 6px;
    }
    .section-text {
      font-size: 13px;
      color: var(--vscode-descriptionForeground, #6b7280);
      line-height: 1.5;
    }
    .info-box {
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    .info-box--green {
      background: var(--vscode-inputValidation-infoBackground, #f0fdf4);
      border: 1px solid #bbf7d0;
    }
    .info-box--yellow {
      background: var(--vscode-inputValidation-warningBackground, #fffbeb);
      border: 1px solid #fde68a;
    }
    .info-box--indigo {
      background: #eef2ff;
      border: 1px solid #c7d2fe;
    }
    .info-box .code {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      color: #6366f1;
      margin: 4px 0;
    }
    .info-box .warning-title {
      font-weight: 600;
      color: #92400e;
      font-size: 12px;
    }
    .info-box .warning-text {
      color: #92400e;
      font-size: 12px;
      margin-top: 2px;
    }
    .promo-title {
      font-weight: 600;
      color: #4f46e5;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .promo-text {
      font-size: 12px;
      color: #374151;
      line-height: 1.5;
    }
    .promo-link {
      color: #6366f1;
      text-decoration: underline;
      cursor: pointer;
      font-size: 12px;
      margin-top: 6px;
      display: inline-block;
    }
    .promo-link:hover { color: #4f46e5; }
    .buttons {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      padding: 16px 24px;
      border-top: 1px solid var(--vscode-editorWidget-border, #e5e7eb);
    }
    .btn {
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.9; }
    .btn--primary {
      background: #6366f1;
      color: #fff;
    }
    .btn--secondary {
      background: var(--vscode-button-secondaryBackground, #f3f4f6);
      color: var(--vscode-button-secondaryForeground, #6b7280);
      border: 1px solid var(--vscode-editorWidget-border, #d1d5db);
    }
    .nickname-input {
      width: 100%;
      margin-top: 6px;
      padding: 8px 12px;
      font-size: 13px;
      border: 1px solid var(--vscode-input-border, #d1d5db);
      border-radius: 6px;
      background: var(--vscode-input-background, #fff);
      color: var(--vscode-input-foreground, #1a1a2e);
    }
    .nickname-input::placeholder {
      color: var(--vscode-input-placeholderForeground, #9ca3af);
    }
    .footer-note {
      text-align: center;
      font-size: 10px;
      color: var(--vscode-descriptionForeground, #9ca3af);
      font-style: italic;
      padding: 0 24px 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        <circle cx="12" cy="16.5" r="1.5" fill="#fff"/>
      </svg>
      <h1>Protect Your Secrets</h1>
    </div>

    <div class="body">
      <div class="section">
        <div class="section-title">What will happen:</div>
        <div class="section-text">
          DotEnvUp will encrypt your .env file locally using X25519 + XChaCha20-Poly1305
          (the same crypto used by Signal and WireGuard). Your secrets stay on your machine.
        </div>
      </div>

      <div class="info-box info-box--green">
        <div class="section-title">Where your key is stored:</div>
        <div class="code">${escapedDir}/identity</div>
        <div class="section-text">(like ~/.ssh &mdash; permissions 600, only you can access it)</div>
      </div>

      <div class="info-box info-box--yellow">
        <div class="warning-title">&#9888; This key is LOCAL to this machine.</div>
        <div class="warning-text">If you lose it, encrypted .env.up files cannot be recovered.</div>
      </div>

      <div class="info-box info-box--indigo">
        <div class="promo-title">Need to share secrets with your team or AI agents?</div>
        <div class="promo-text">
          UnknownPassword adds encrypted sharing, safe AI agent access,
          automatic key backup, and team management &mdash; so you never lose a key
          or leak a secret.
        </div>
        <a class="promo-link" href="https://unknownpassword.com" target="_blank">
          Learn more at unknownpassword.com &rarr;
        </a>
      </div>

      <div class="section">
        <div class="section-title">Optional nickname (for .env.up header)</div>
        <div class="section-text">
          Shown as &quot;Encrypted-By&quot; in committed .env.up so teammates see who created it. Leave blank for @local.
        </div>
        <input type="text" id="nicknameInput" class="nickname-input" placeholder="e.g. Alice or dev-machine" maxlength="64" />
      </div>
    </div>

    <div class="buttons">
      <button class="btn btn--secondary" id="cancelBtn">Cancel</button>
      <button class="btn btn--primary" id="protectBtn">Protect My .env</button>
    </div>

    <div class="footer-note">
      Shown once on first protect. Storage mode: user-file (~/.dotenvup/identity). Additional backends are planned.
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('protectBtn').addEventListener('click', () => {
      const nick = document.getElementById('nicknameInput').value.trim();
      vscode.postMessage({ command: 'protect', nickname: nick || undefined });
    });
    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'cancel' });
    });
  </script>
</body>
</html>`;
}

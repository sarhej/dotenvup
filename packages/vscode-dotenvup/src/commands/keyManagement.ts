import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import type { ExtensionKeyStore } from '../keystore';
import * as keyExportCmd from './keyExport';
import * as keyImportCmd from './keyImport';
import * as logger from '../logger';

interface InventoryItem {
  type: string;
  status: string;
  keyId?: string;
  path: string;
  error?: string;
}

interface WebviewState {
  modeSetting: string;
  storageMode: string;
  identityDir: string;
  hasKeypair: boolean;
  keyId?: string;
  sessionActive: boolean;
  sessionIdleExpiresIn: string | null;
  sessionAbsoluteExpiresIn: string | null;
  keychainHelper: boolean;
  migrateRecommended: boolean;
  inventory: InventoryItem[];
  scannedFiles: number;
  truncated: boolean;
  scanMode: 'quick' | 'deep';
  error?: string;
}

function formatRemaining(ms: number | null): string | null {
  if (ms == null || ms < 0) return null;
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.round(mins / 60)}h`;
}

async function buildState(
  keystore: ExtensionKeyStore,
  workspaceRoot: string | undefined,
  scanMode: 'quick' | 'deep',
): Promise<WebviewState> {
  const identityDir = keystore.getIdentityDir();
  const modeSetting = vscode.workspace.getConfiguration('dotenvup').get<string>('keyStorageMode', 'user-file');
  const hasKeypair = await keystore.hasKeypair();
  let keyId: string | undefined;
  const publicKey = await keystore.getPublicKey();
  if (publicKey) {
    const { keyFingerprint } = await import('@dotenvup/format');
    keyId = await keyFingerprint(publicKey);
  }

  const {
    detectKeyStorageMode,
    sessionStatus,
    keychainHelperAvailable,
    recoveryBundleExists,
  } = await import('@dotenvup/format');

  const storageMode = await detectKeyStorageMode(identityDir);
  const session = await sessionStatus();
  const keychainHelper =
    process.platform === 'darwin' ? await keychainHelperAvailable() : false;
  const hasRecovery = keyId ? await recoveryBundleExists(identityDir, keyId) : false;
  const migrateRecommended =
    process.platform === 'darwin' &&
    storageMode === 'file-envelope' &&
    keychainHelper &&
    hasRecovery;

  const roots = scanMode === 'deep'
    ? [os.homedir()]
    : [
        identityDir,
        workspaceRoot ?? '',
        path.join(os.homedir(), 'Desktop'),
        path.join(os.homedir(), 'Documents'),
        path.join(os.homedir(), 'Downloads'),
      ].filter(Boolean);

  const { discoverLocalKeyCandidates } = await import('@dotenvup/format');
  const summary = await discoverLocalKeyCandidates({
    roots,
    maxDepth: scanMode === 'deep' ? 12 : 6,
    maxFiles: scanMode === 'deep' ? 50000 : 6000,
  });

  const inventory: InventoryItem[] = summary.results
    .filter((r) => r.status === 'candidate' || r.status === 'invalid')
    .map((r) => ({
      type: r.type,
      status: r.status,
      keyId: r.keyId,
      path: r.path,
      error: r.error,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 150);

  return {
    modeSetting,
    storageMode,
    identityDir,
    hasKeypair,
    keyId,
    sessionActive: session.active,
    sessionIdleExpiresIn: session.active ? formatRemaining(session.idleMsLeft) : null,
    sessionAbsoluteExpiresIn: session.active ? formatRemaining(session.absoluteMsLeft) : null,
    keychainHelper,
    migrateRecommended,
    inventory,
    scannedFiles: summary.scannedFiles,
    truncated: summary.truncated,
    scanMode,
  };
}

function htmlContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>DotEnvUp Key Management</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .wrap { max-width: 980px; margin: 0 auto; padding: 18px 16px 20px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 14px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 12px;
    }
    .card h2 { font-size: 13px; margin: 0 0 8px; }
    .kv { font-size: 12px; line-height: 1.55; }
    .mono {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      color: #8b9cff;
      word-break: break-all;
    }
    .ok { color: #5ad182; }
    .warn { color: #f0b74f; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    button {
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button:disabled { opacity: 0.45; cursor: default; }
    .inv { margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 7px 6px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; }
    .muted { color: var(--vscode-descriptionForeground); }
    .status-candidate { color: #a3e635; }
    .status-invalid { color: #f87171; }
    .footer { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 10px; }
    .tip {
      margin-top: 12px;
      padding: 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      background: var(--vscode-editorWidget-background);
      font-size: 12px;
      line-height: 1.5;
    }
    .json {
      margin-top: 8px;
      padding: 8px 10px;
      border-radius: 6px;
      background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.12));
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Key Management</h1>
    <div class="sub">Local identity, Keychain / session status, backup &amp; restore. Never shows private key material.</div>

    <div class="grid">
      <section class="card">
        <h2>Current Identity</h2>
        <div id="identity" class="kv">Loading...</div>
        <div id="agentJson" class="json muted"></div>
      </section>
      <section class="card">
        <h2>Actions</h2>
        <div class="row">
          <button id="warmBtn">Warm session</button>
          <button id="lockSessionBtn" class="secondary">Lock session</button>
          <button id="migrateBtn" class="secondary">Migrate to Keychain</button>
        </div>
        <div class="row">
          <button id="exportBtn">Export Key</button>
          <button id="importBtn">Import Key</button>
          <button id="openFolderBtn" class="secondary">Open Identity Folder</button>
        </div>
        <div class="row">
          <button id="refreshBtn" class="secondary">Refresh</button>
          <button id="deepScanBtn" class="secondary">Deep Scan</button>
        </div>
        <div class="footer">Warm session prompts Touch ID once, then Safe Edit / Unlock stay quiet until idle TTL or screen lock.</div>
      </section>
    </div>

    <div id="tip" class="tip muted"></div>

    <section class="card inv">
      <h2>Local Key Inventory</h2>
      <div id="inventoryMeta" class="muted">Loading...</div>
      <table>
        <thead>
          <tr><th>Type</th><th>Key Id</th><th>Status</th><th>Path / Error</th></tr>
        </thead>
        <tbody id="inventoryRows"></tbody>
      </table>
      <div class="tip">
        <div><strong>Restore .env.up from backup</strong></div>
        <div>Backups look like <span class="mono">.env.up.bak-&lt;timestamp&gt;</span>. Keep current .env.up as rollback, copy a backup to .env.up, then unlock.</div>
      </div>
    </section>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const identityEl = document.getElementById('identity');
    const agentJsonEl = document.getElementById('agentJson');
    const tipEl = document.getElementById('tip');
    const metaEl = document.getElementById('inventoryMeta');
    const rowsEl = document.getElementById('inventoryRows');
    const migrateBtn = document.getElementById('migrateBtn');
    const lockSessionBtn = document.getElementById('lockSessionBtn');

    function render(state) {
      if (state.error) {
        identityEl.innerHTML = '<span class="warn">' + state.error + '</span>';
        metaEl.textContent = 'Scan failed.';
        rowsEl.innerHTML = '';
        agentJsonEl.textContent = '';
        tipEl.textContent = '';
        return;
      }

      const sessionClass = state.sessionActive ? 'ok' : 'warn';
      const sessionLabel = state.sessionActive
        ? ('warm (idle ~' + (state.sessionIdleExpiresIn || '?') + ')')
        : 'cold (next decrypt may prompt)';

      identityEl.innerHTML = [
        '<div>Detected storage: <strong>' + state.storageMode + '</strong></div>',
        '<div>Setting keyStorageMode: <span class="mono">' + state.modeSetting + '</span></div>',
        '<div>Identity dir: <span class="mono">' + state.identityDir + '</span></div>',
        '<div>Key id: ' + (state.keyId ? '<span class="mono">' + state.keyId + '</span>' : '<span class="warn">none</span>') + '</div>',
        '<div class="' + (state.hasKeypair ? 'ok' : 'warn') + '">' + (state.hasKeypair ? 'Keypair configured' : 'No keypair configured') + '</div>',
        '<div class="' + sessionClass + '">Session: ' + sessionLabel + '</div>',
        '<div>Keychain helper: ' + (state.keychainHelper ? '<span class="ok">available</span>' : '<span class="muted">unavailable</span>') + '</div>'
      ].join('');

      agentJsonEl.textContent = JSON.stringify({
        keyStorage: state.storageMode,
        keyId: state.keyId || null,
        sessionActive: state.sessionActive,
        sessionIdleExpiresIn: state.sessionIdleExpiresIn,
        sessionAbsoluteExpiresIn: state.sessionAbsoluteExpiresIn,
        keychainHelper: state.keychainHelper,
        keychainMigrateRecommended: state.migrateRecommended
      }, null, 2);

      tipEl.innerHTML = state.migrateRecommended
        ? 'Opt-in: move the wrapping key into macOS Keychain (Touch ID / password). Requires a recovery bundle. Do <strong>not</strong> run Init — that creates a new Key-Id.'
        : (state.storageMode === 'keychain'
          ? 'Agents: call MCP <span class="mono">dotenvup_status</span> (sessionActive) before <span class="mono">dotenvup_run</span>. Cold + non-TTY exits 1 — warm once here or with <span class="mono">up run -- true</span>.'
          : 'File envelope is fine. On macOS you can migrate to Keychain after <span class="mono">up key upgrade</span>.');

      migrateBtn.disabled = !state.migrateRecommended;
      lockSessionBtn.disabled = !state.sessionActive;

      metaEl.textContent = 'Scanned files: ' + state.scannedFiles
        + (state.truncated ? ' (truncated)' : '')
        + ' - mode: ' + state.scanMode
        + ' - entries: ' + state.inventory.length;

      if (!state.inventory.length) {
        rowsEl.innerHTML = '<tr><td colspan="4" class="muted">No key candidates found.</td></tr>';
        return;
      }

      rowsEl.innerHTML = state.inventory.map((row) => {
        const statusClass = row.status === 'invalid' ? 'status-invalid' : 'status-candidate';
        const detail = row.error ? row.error : row.path;
        return '<tr>'
          + '<td>' + row.type + '</td>'
          + '<td>' + (row.keyId ? '<span class="mono">' + row.keyId + '</span>' : '-') + '</td>'
          + '<td class="' + statusClass + '">' + row.status + '</td>'
          + '<td>' + detail + '</td>'
          + '</tr>';
      }).join('');
    }

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') render(event.data.payload);
    });

    document.getElementById('exportBtn').addEventListener('click', () => vscode.postMessage({ command: 'export' }));
    document.getElementById('importBtn').addEventListener('click', () => vscode.postMessage({ command: 'import' }));
    document.getElementById('openFolderBtn').addEventListener('click', () => vscode.postMessage({ command: 'openFolder' }));
    document.getElementById('refreshBtn').addEventListener('click', () => vscode.postMessage({ command: 'refresh', deep: false }));
    document.getElementById('deepScanBtn').addEventListener('click', () => vscode.postMessage({ command: 'refresh', deep: true }));
    document.getElementById('warmBtn').addEventListener('click', () => vscode.postMessage({ command: 'warmSession' }));
    document.getElementById('lockSessionBtn').addEventListener('click', () => vscode.postMessage({ command: 'lockSession' }));
    document.getElementById('migrateBtn').addEventListener('click', () => vscode.postMessage({ command: 'migrateKeychain' }));
  </script>
</body>
</html>`;
}

export async function run(context: ExtensionContext, keystore: ExtensionKeyStore): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'dotenvup.keyManagement',
    'DotEnvUp - Key Management',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = htmlContent();

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let scanMode: 'quick' | 'deep' = 'quick';

  const postState = async (): Promise<void> => {
    try {
      const state = await buildState(keystore, workspaceRoot, scanMode);
      panel.webview.postMessage({ type: 'state', payload: state });
    } catch (err) {
      panel.webview.postMessage({
        type: 'state',
        payload: {
          modeSetting: 'user-file',
          storageMode: 'unknown',
          identityDir: keystore.getIdentityDir(),
          hasKeypair: false,
          sessionActive: false,
          sessionIdleExpiresIn: null,
          sessionAbsoluteExpiresIn: null,
          keychainHelper: false,
          migrateRecommended: false,
          inventory: [],
          scannedFiles: 0,
          truncated: false,
          scanMode,
          error: err instanceof Error ? err.message : String(err),
        } as WebviewState,
      });
    }
  };

  await postState();

  panel.webview.onDidReceiveMessage(
    async (msg: { command?: string; deep?: boolean }) => {
      switch (msg.command) {
        case 'export':
          await keyExportCmd.run(keystore);
          break;
        case 'import':
          await keyImportCmd.run(keystore);
          break;
        case 'openFolder':
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(keystore.getIdentityDir()));
          break;
        case 'refresh':
          scanMode = msg.deep ? 'deep' : 'quick';
          break;
        case 'warmSession': {
          const { requirePrivateKeyOrNotify } = await import('../keyErrors');
          const key = await requirePrivateKeyOrNotify(keystore, 'Warm session');
          if (key) {
            void vscode.window.showInformationMessage('DotEnvUp: Session warm. Safe Edit / Unlock should not re-prompt until idle TTL or screen lock.');
          }
          break;
        }
        case 'lockSession': {
          try {
            const { sessionStop } = await import('@dotenvup/format');
            const ok = await sessionStop();
            void vscode.window.showInformationMessage(
              ok ? 'DotEnvUp: Session locked.' : 'DotEnvUp: No active session.',
            );
          } catch (err) {
            logger.error('DotEnvUp: Failed to lock session', err);
          }
          break;
        }
        case 'migrateKeychain': {
          if (process.platform !== 'darwin') {
            void vscode.window.showErrorMessage('DotEnvUp: Keychain migration is macOS-only.');
            break;
          }
          const confirm = await vscode.window.showWarningMessage(
            'Move the identity wrapping key into macOS Keychain? Touch ID / password will prompt. Recovery bundle required. File envelope is left alone if you cancel.',
            'Migrate',
            'Cancel',
          );
          if (confirm !== 'Migrate') break;
          try {
            const {
              detectKeyStorageMode,
              migrateFileEnvelopeToKeychain,
              keychainHelperAvailable,
              recoveryBundleExists,
              keyFingerprint,
            } = await import('@dotenvup/format');
            const identityDir = keystore.getIdentityDir();
            if (!(await keychainHelperAvailable())) {
              void vscode.window.showErrorMessage('DotEnvUp: Keychain helper not available. Install extension ≥0.6.4 or build @dotenvup/keychain.');
              break;
            }
            const mode = await detectKeyStorageMode(identityDir);
            if (mode === 'keychain') {
              void vscode.window.showInformationMessage('DotEnvUp: Already using Keychain.');
              break;
            }
            if (mode !== 'file-envelope') {
              void vscode.window.showErrorMessage('DotEnvUp: Run `up key upgrade` first (file envelope + recovery).');
              break;
            }
            const pub = await keystore.getPublicKey();
            if (!pub) {
              void vscode.window.showErrorMessage('DotEnvUp: No public key found.');
              break;
            }
            const keyId = await keyFingerprint(pub);
            if (!(await recoveryBundleExists(identityDir, keyId))) {
              void vscode.window.showErrorMessage('DotEnvUp: Recovery bundle required. Run `up key upgrade` first.');
              break;
            }
            const result = await migrateFileEnvelopeToKeychain(identityDir);
            void vscode.window.showInformationMessage(
              `DotEnvUp: Keychain migration complete. Key-Id: ${result.keyId}`,
            );
          } catch (err) {
            const { showKeyLoadError } = await import('../keyErrors');
            if (!showKeyLoadError(err, 'Keychain migrate')) {
              const msg = err instanceof Error ? err.message : String(err);
              void vscode.window.showErrorMessage(`DotEnvUp: ${msg}`);
            }
          }
          break;
        }
        default:
          break;
      }
      await postState();
    },
    undefined,
    context.subscriptions,
  );
}

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import type { ExtensionKeyStore } from '../keystore';
import * as keyExportCmd from './keyExport';
import * as keyImportCmd from './keyImport';

interface InventoryItem {
  type: string;
  status: string;
  keyId?: string;
  path: string;
  error?: string;
}

interface WebviewState {
  mode: string;
  identityDir: string;
  hasKeypair: boolean;
  keyId?: string;
  inventory: InventoryItem[];
  scannedFiles: number;
  truncated: boolean;
  scanMode: 'quick' | 'deep';
  error?: string;
}

async function buildState(
  keystore: ExtensionKeyStore,
  workspaceRoot: string | undefined,
  scanMode: 'quick' | 'deep',
): Promise<WebviewState> {
  const identityDir = keystore.getIdentityDir();
  const mode = vscode.workspace.getConfiguration('dotenvup').get<string>('keyStorageMode', 'user-file');
  const hasKeypair = await keystore.hasKeypair();
  let keyId: string | undefined;
  const publicKey = await keystore.getPublicKey();
  if (publicKey) {
    const { keyFingerprint } = await import('@dotenvup/format');
    keyId = await keyFingerprint(publicKey);
  }

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
    mode,
    identityDir,
    hasKeypair,
    keyId,
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
    .inv { margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 7px 6px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; }
    .muted { color: var(--vscode-descriptionForeground); }
    .status-candidate { color: #a3e635; }
    .status-invalid { color: #f87171; }
    .footer { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 10px; }
    .restore {
      margin-top: 12px;
      padding: 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      background: var(--vscode-editorWidget-background);
      font-size: 12px;
      line-height: 1.5;
    }
    .restore .title { font-weight: 600; margin-bottom: 4px; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Key Management</h1>
    <div class="sub">View local key identity and manage key backup/restore.</div>

    <div class="grid">
      <section class="card">
        <h2>Current Identity</h2>
        <div id="identity" class="kv">Loading...</div>
      </section>
      <section class="card">
        <h2>Actions</h2>
        <div class="row">
          <button id="exportBtn">Export Key</button>
          <button id="importBtn">Import Key</button>
          <button id="openFolderBtn" class="secondary">Open Identity Folder</button>
        </div>
        <div class="row">
          <button id="refreshBtn" class="secondary">Refresh</button>
          <button id="deepScanBtn" class="secondary">Deep Scan</button>
        </div>
        <div class="footer">Never shows private key material. Only key ids and file paths.</div>
      </section>
    </div>

    <section class="card inv">
      <h2>Local Key Inventory</h2>
      <div id="inventoryMeta" class="muted">Loading...</div>
      <table>
        <thead>
          <tr><th>Type</th><th>Key Id</th><th>Status</th><th>Path / Error</th></tr>
        </thead>
        <tbody id="inventoryRows"></tbody>
      </table>
      <div class="restore">
        <div class="title">Restore .env.up from backup</div>
        <div>DotEnvUp currently creates backups as <span class="mono">.env.up.bak-&#60;timestamp&#62;</span>.</div>
        <div>To restore manually: keep current <span class="mono">.env.up</span> as rollback, copy a backup to <span class="mono">.env.up</span>, then run unlock.</div>
      </div>
    </section>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const identityEl = document.getElementById('identity');
    const metaEl = document.getElementById('inventoryMeta');
    const rowsEl = document.getElementById('inventoryRows');

    function render(state) {
      if (state.error) {
        identityEl.innerHTML = '<span class="warn">' + state.error + '</span>';
        metaEl.textContent = 'Scan failed.';
        rowsEl.innerHTML = '';
        return;
      }

      identityEl.innerHTML = [
        '<div>Storage mode: <strong>' + state.mode + '</strong></div>',
        '<div>Identity dir: <span class="mono">' + state.identityDir + '</span></div>',
        '<div>Key id: ' + (state.keyId ? '<span class="mono">' + state.keyId + '</span>' : '<span class="warn">none</span>') + '</div>',
        '<div class="' + (state.hasKeypair ? 'ok' : 'warn') + '">' + (state.hasKeypair ? 'Keypair configured' : 'No keypair configured') + '</div>'
      ].join('');

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
          mode: 'user-file',
          identityDir: keystore.getIdentityDir(),
          hasKeypair: false,
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
        default:
          break;
      }
      await postState();
    },
    undefined,
    context.subscriptions,
  );
}


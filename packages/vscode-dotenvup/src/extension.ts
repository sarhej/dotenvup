/**
 * DotEnvUp — VS Code Extension
 *
 * Local .env.up file management:
 * - Lock/unlock (status bar + commands)
 * - .env ↔ .env.up conversion
 * - Key metadata display
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionKeyStore } from './keystore';
import { createStatusBar, updateStatusBar } from './statusBar';
import * as initCmd from './commands/init';
import * as importCmd from './commands/import';
import * as lockCmd from './commands/lock';
import * as unlockCmd from './commands/unlock';
import * as showKeysCmd from './commands/showKeys';
import * as statusCmd from './commands/status';
import * as keyExportCmd from './commands/keyExport';
import * as keyImportCmd from './commands/keyImport';
import * as keyManagementCmd from './commands/keyManagement';
import * as keyStorageStatusCmd from './commands/keyStorageStatus';
import * as recoverKeyMismatchCmd from './commands/recoverKeyMismatch';
import * as recipientsListCmd from './commands/recipientsList';
import * as recipientsAddCmd from './commands/recipientsAdd';
import * as recipientsRemoveCmd from './commands/recipientsRemove';
import * as recipientsDiscoverCmd from './commands/recipientsDiscover';
import * as safeEditCmd from './commands/safeEdit';
import * as logger from './logger';
import { getWorkspaceEnvStates } from './workspace';
import { SafeEditFSProvider } from './providers/safeEditFSProvider';
import { SafeEditCodeLensProvider } from './providers/safeEditCodeLens';
import { registerSafeEditCustomEditor } from './providers/safeEditCustomEditor';

let statusBarItem: vscode.StatusBarItem;
let keystore: ExtensionKeyStore;

/** One-click protect flow for a single env root (Import .env → .env.up then lock). */
async function runProtectForRoot(
  context: vscode.ExtensionContext,
  workspace: typeof import('./workspace'),
  targetRoot: string,
  fsP: typeof import('fs/promises'),
): Promise<void> {
  const hasKey = await keystore.hasKeypair();
  if (!hasKey) {
    const { showFirstProtectPanel } = await import('./webview/firstProtect');
    const { setNickname } = await import('./author');
    const result = await showFirstProtectPanel(context, keystore.getIdentityDir());
    if (result.action !== 'protect') return;
    await context.globalState.update('dotenvup.firstProtectShown', true);
    const { generateKeypair } = await import('@dotenvup/format');
    const { publicKey, privateKey } = await generateKeypair();
    await keystore.storeKeypair(publicKey, privateKey);
    if (result.nickname) {
      try {
        await setNickname(keystore.getIdentityDir(), result.nickname);
      } catch {
        // best-effort
      }
    }
  }
  const config = vscode.workspace.getConfiguration('dotenvup');
  const encryptAll = config.get<boolean>('encryptAllEnvFiles', false);
  const filesToProtect = encryptAll
    ? await workspace.listPlaintextEnvFiles(targetRoot)
    : [path.join(targetRoot, '.env')];
  if (filesToProtect.length === 0) return;
  try {
    await fsP.access(filesToProtect[0]);
  } catch {
    return;
  }
  let protectedCount = 0;
  for (const srcPath of filesToProtect) {
    const imported = await importCmd.run(keystore, targetRoot, { silent: true, sourcePath: srcPath });
    if (!imported) {
      if (!encryptAll) return;
      continue;
    }
    const outPath = path.join(path.dirname(srcPath), path.basename(srcPath) + '.up');
    try {
      const { parse, decrypt } = await import('@dotenvup/format');
      const envUpContent = await fsP.readFile(outPath, 'utf8');
      const file = parse(envUpContent);
      const privKey = await keystore.getPrivateKey();
      if (!privKey) throw new Error('No private key');
      const decryptResult = await decrypt(file, '@local', privKey);
      if (Object.keys(decryptResult.entries).length === 0) throw new Error('No entries');
    } catch {
      if (!encryptAll) {
        vscode.window.showErrorMessage('DotEnvUp: Import succeeded but verification failed. Your .env was NOT deleted.');
        return;
      }
      continue;
    }
    const createBackupBeforeLock = config.get<boolean>('createBackupBeforeLock', true);
    if (createBackupBeforeLock) {
      try {
        await fsP.copyFile(outPath, path.join(path.dirname(outPath), path.basename(outPath) + '.bak-' + Date.now()));
      } catch {}
    }
    await lockCmd.run(keystore, targetRoot, { envPath: srcPath, envUpPath: outPath });
    protectedCount++;
  }
  const createBackupBeforeLock = config.get<boolean>('createBackupBeforeLock', true);
  const msg = protectedCount === 0
    ? 'DotEnvUp: No files were protected.'
    : protectedCount === 1
      ? (createBackupBeforeLock ? 'DotEnvUp: .env is now protected. Encrypted backup saved. Click the status bar to unlock.' : 'DotEnvUp: .env is now protected. Click the status bar to unlock.')
      : (createBackupBeforeLock ? `DotEnvUp: ${protectedCount} files protected. Encrypted backups saved.` : `DotEnvUp: ${protectedCount} files protected.`);
  vscode.window.showInformationMessage(msg);
}

async function refreshStatusBarFromFs(): Promise<void> {
  const states = await getWorkspaceEnvStates();
  const withEnvUp = states.filter((s) => s.state === 'locked' || s.state === 'unlocked');
  const unprotected = states.filter((s) => s.state === 'unprotected');

  if (withEnvUp.length === 0) {
    if (unprotected.length > 0) {
      statusBarItem.text = '$(warning) All unprotected';
      statusBarItem.tooltip = unprotected.length === 1
        ? 'One .env has no encryption. Click to protect.'
        : `${unprotected.length} .env locations have no encryption. Click to protect.`;
      statusBarItem.show();
    } else {
      statusBarItem.text = '$(shield) DotEnvUp';
      statusBarItem.tooltip = 'No .env or .env.up found. Click to init or import.';
      statusBarItem.show();
    }
    return;
  }

  statusBarItem.show();
  const expiresAt = unlockCmd.getUnlockExpiresAt();

  const anyUnlocked = withEnvUp.some((s) => s.state === 'unlocked');

  // Partially protected when any location has both .env and .env.up (unlocked)
  if (unprotected.length === 0 && anyUnlocked) {
    statusBarItem.text = '$(warning) Partially protected';
    statusBarItem.tooltip = withEnvUp
      .map((s) => (s.state === 'unlocked' ? `${s.name}: both .env and .env.up — lock to remove .env` : `${s.name}: ${s.state}`))
      .join('\n') + '\nClick to lock/unlock.';
    if (expiresAt != null && expiresAt > Date.now()) {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      const m = Math.floor(remaining / 60);
      const sec = remaining % 60;
      statusBarItem.tooltip += `\nAuto-lock in ${m}m ${sec}s`;
    }
    return;
  }

  // All protected (no unprotected, and no unlocked — all locations locked)
  if (unprotected.length === 0) {
    if (withEnvUp.length === 1) {
      const s = withEnvUp[0];
      updateStatusBar(statusBarItem, true, s.keyCount, expiresAt);
    } else {
      statusBarItem.text = '$(lock) All protected';
      statusBarItem.tooltip = withEnvUp.map((s) => `${s.name}: ${s.state}`).join('\n') + '\nClick to lock/unlock.';
      if (expiresAt != null && expiresAt > Date.now()) {
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        const m = Math.floor(remaining / 60);
        const sec = remaining % 60;
        statusBarItem.tooltip += `\nAuto-lock in ${m}m ${sec}s`;
      }
    }
    return;
  }

  // Partially protected (some locations have only .env, no .env.up)
  statusBarItem.text = '$(warning) Partially protected';
  const allRelevant = [...withEnvUp, ...unprotected];
  statusBarItem.tooltip = allRelevant.map((s) => `${s.name}: ${s.state}`).join('\n') + '\nClick to protect or lock/unlock.';
  if (expiresAt != null && expiresAt > Date.now()) {
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const m = Math.floor(remaining / 60);
    const sec = remaining % 60;
    statusBarItem.tooltip += `\nAuto-lock in ${m}m ${sec}s`;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  logger.debug('Activating DotEnvUp extension');
  keystore = new ExtensionKeyStore(context);

  statusBarItem = createStatusBar(() => {
    vscode.commands.executeCommand('dotenvup.toggleLock');
  });
  updateStatusBar(statusBarItem, true);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register Safe Edit providers
  const safeEditFS = new SafeEditFSProvider(keystore);
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('dotenvup-safe', safeEditFS, { isCaseSensitive: true })
  );
  
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file', language: 'dotenvup' }, new SafeEditCodeLensProvider())
  );

  registerSafeEditCustomEditor(context, keystore);

  void refreshStatusBarFromFs();
  const countdownInterval = setInterval(() => void refreshStatusBarFromFs(), 30_000);
  context.subscriptions.push({ dispose: () => clearInterval(countdownInterval) });

  context.subscriptions.push(
    vscode.commands.registerCommand('dotenvup.init', () => initCmd.run(keystore)),
    vscode.commands.registerCommand('dotenvup.lock', async () => {
      await lockCmd.run(keystore);
      await refreshStatusBarFromFs();
    }),
    vscode.commands.registerCommand('dotenvup.unlock', async () => {
      await unlockCmd.run(keystore);
      await refreshStatusBarFromFs();
    }),
    vscode.commands.registerCommand('dotenvup.toggleLock', async () => {
      const workspace = await import('./workspace');
      const fsP = await import('fs/promises');
      const states = await workspace.getWorkspaceEnvStates();
      const withEnvUp = states.filter((s) => s.state === 'locked' || s.state === 'unlocked');
      const unprotected = states.filter((s) => s.state === 'unprotected');

      // Single location with .env.up and no unprotected → toggle that one
      if (withEnvUp.length === 1 && unprotected.length === 0) {
        const root = withEnvUp[0].root;
        const envPath = path.join(root, '.env');
        const hasEnv = await fsP.access(envPath).then(() => true).catch(() => false);
        
        const items: vscode.QuickPickItem[] = [];
        const itemData: { action: 'lock' | 'unlock' | 'safeEdit' | 'copyKey' | 'encryptFor' | 'encryptForGitHub' | 'decryptSealed' }[] = [];

        items.push({ 
          label: '$(edit) Safe Edit .env', 
          description: 'Edit secrets in memory without writing to disk',
          detail: root 
        });
        itemData.push({ action: 'safeEdit' });

        if (hasEnv) {
          items.push({ 
            label: '$(lock) Lock .env', 
            description: 'Encrypt and remove .env from disk',
            detail: root 
          });
          itemData.push({ action: 'lock' });
        } else {
          items.push({ 
            label: '$(unlock) Unlock to Disk', 
            description: 'Decrypt .env to disk (legacy)',
            detail: root 
          });
          itemData.push({ action: 'unlock' });
        }

        items.push({ label: 'Sharing', kind: vscode.QuickPickItemKind.Separator });
        itemData.push({ action: 'copyKey' }); // placeholder for separator

        items.push({ label: '$(key) Copy My Public Key', description: 'Copy to clipboard for sharing' });
        itemData.push({ action: 'copyKey' });

        items.push({ label: '$(person-add) Encrypt for Recipient...', description: 'Add a teammate\'s key and re-encrypt' });
        itemData.push({ action: 'encryptFor' });
        items.push({ label: '$(github) Encrypt for GitHub User...', description: 'Add GitHub user as recipient to .env.up' });
        itemData.push({ action: 'encryptForGitHub' });
        items.push({ label: '$(unlock) Decrypt Sealed File...', description: 'Decrypt a .sealed file' });
        itemData.push({ action: 'decryptSealed' });

        const choice = await vscode.window.showQuickPick(items, {
          placeHolder: 'DotEnvUp Actions',
          title: 'DotEnvUp'
        });

        if (!choice) return;
        const idx = items.indexOf(choice);
        const action = itemData[idx].action;

        if (action === 'safeEdit') {
          await safeEditCmd.run(vscode.Uri.file(path.join(root, '.env.up')), keystore);
        } else if (action === 'lock') {
          await lockCmd.run(keystore, root);
        } else if (action === 'unlock') {
          await unlockCmd.run(keystore, root);
        } else if (action === 'copyKey') {
          const copyKeyCmd = await import('./commands/copyMyPublicKey');
          await copyKeyCmd.run(keystore);
        } else if (action === 'encryptFor') {
          const encryptForCmd = await import('./commands/encryptForRecipient');
          await encryptForCmd.run(keystore, vscode.Uri.file(path.join(root, '.env.up')));
        } else if (action === 'encryptForGitHub') {
          const encryptForGitHubCmd = await import('./commands/encryptForGitHub');
          await encryptForGitHubCmd.run(keystore, vscode.Uri.file(path.join(root, '.env.up')));
        } else if (action === 'decryptSealed') {
          const decryptSealedCmd = await import('./commands/decryptSealed');
          await decryptSealedCmd.run(keystore);
        }
        
        await refreshStatusBarFromFs();
        return;
      }

      // No env files found anywhere → show init/import options
      if (withEnvUp.length === 0 && unprotected.length === 0) {
        const items: vscode.QuickPickItem[] = [
          { label: '$(key) Init (generate keypair)', description: 'Create a new keypair to start using DotEnvUp' },
          { label: '$(file-add) Import .env', description: 'Encrypt an existing .env file' },
        ];
        const choice = await vscode.window.showQuickPick(items, {
          placeHolder: 'No .env or .env.up found',
          title: 'DotEnvUp',
        });
        if (!choice) return;
        if (choice.label.includes('Init')) {
          await initCmd.run(keystore);
        } else {
          await importCmd.run(keystore);
        }
        await refreshStatusBarFromFs();
        return;
      }

      // No .env.up anywhere → protect flow (pick unprotected folder if multiple)
      if (withEnvUp.length === 0) {
        const targetRoot = unprotected.length === 1
          ? unprotected[0].root
          : (await vscode.window.showQuickPick(
              unprotected.map((s) => ({ label: s.name, description: s.root, root: s.root })),
              { placeHolder: 'Select folder to protect', title: 'DotEnvUp' },
            ))?.root;
        if (!targetRoot) return;
        await runProtectForRoot(context, workspace, targetRoot, fsP);
        await refreshStatusBarFromFs();
        return;
      }

      // Multiple locations and/or some unprotected → show pick: Unlock / Lock / Protect per location
      const items: vscode.QuickPickItem[] = [];
      const itemData: { root: string; action: 'lock' | 'unlock' | 'protect' | 'safeEdit' | 'copyKey' | 'encryptFor' | 'encryptForGitHub' | 'decryptSealed' }[] = [];
      for (const s of withEnvUp) {
        items.push({ label: '$(edit) Safe Edit', description: s.name, detail: s.root });
        itemData.push({ root: s.root, action: 'safeEdit' });

        if (s.state === 'locked') {
          items.push({ label: '$(unlock) Unlock to Disk', description: s.name, detail: s.root });
          itemData.push({ root: s.root, action: 'unlock' });
        } else {
          items.push({ label: '$(lock) Lock', description: s.name, detail: s.root });
          itemData.push({ root: s.root, action: 'lock' });
        }
      }
      for (const s of unprotected) {
        items.push({ label: '$(warning) Protect', description: s.name, detail: s.root });
        itemData.push({ root: s.root, action: 'protect' });
      }

      items.push({ label: 'Sharing', kind: vscode.QuickPickItemKind.Separator });
      itemData.push({ root: '', action: 'copyKey' });

      items.push({ label: '$(key) Copy My Public Key', description: 'Copy to clipboard for sharing' });
      itemData.push({ root: '', action: 'copyKey' });

      items.push({ label: '$(person-add) Encrypt for Recipient...', description: 'Add a teammate\'s key and re-encrypt' });
      itemData.push({ root: '', action: 'encryptFor' });
      items.push({ label: '$(github) Encrypt for GitHub User...', description: 'Add GitHub user as recipient to .env.up' });
      itemData.push({ root: '', action: 'encryptForGitHub' });
      items.push({ label: '$(unlock) Decrypt Sealed File...', description: 'Decrypt a .sealed file' });
      itemData.push({ root: '', action: 'decryptSealed' });

      const choice = await vscode.window.showQuickPick(items, {
        placeHolder: 'Choose location to lock, unlock, or protect',
        title: 'DotEnvUp',
        matchOnDescription: true,
      });
      if (!choice) return;
      const idx = items.findIndex((i) => i.description === choice.description && i.detail === choice.detail && i.label === choice.label);
      const data = idx >= 0 ? itemData[idx] : undefined;
      if (!data) return;
      if (data.action === 'safeEdit') {
        await safeEditCmd.run(vscode.Uri.file(path.join(data.root, '.env.up')), keystore);
      } else if (data.action === 'unlock') {
        await unlockCmd.run(keystore, data.root);
      } else if (data.action === 'lock') {
        await lockCmd.run(keystore, data.root);
      } else if (data.action === 'protect') {
        await runProtectForRoot(context, workspace, data.root, fsP);
      } else if (data.action === 'copyKey') {
        const copyKeyCmd = await import('./commands/copyMyPublicKey');
        await copyKeyCmd.run(keystore);
      } else if (data.action === 'encryptFor') {
        const encryptForCmd = await import('./commands/encryptForRecipient');
        await encryptForCmd.run(keystore);
      } else if (data.action === 'encryptForGitHub') {
        const encryptForGitHubCmd = await import('./commands/encryptForGitHub');
        await encryptForGitHubCmd.run(keystore);
      } else if (data.action === 'decryptSealed') {
        const decryptSealedCmd = await import('./commands/decryptSealed');
        await decryptSealedCmd.run(keystore);
      }
      await refreshStatusBarFromFs();
    }),
    vscode.commands.registerCommand('dotenvup.import', () => importCmd.run(keystore)),
    vscode.commands.registerCommand('dotenvup.importAll', async () => {
      const workspace = await import('./workspace');
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (folders.length === 0) {
        vscode.window.showWarningMessage('DotEnvUp: No workspace folder open.');
        return;
      }
      const targetRoot = folders.length === 1
        ? folders[0].uri.fsPath
        : (await vscode.window.showQuickPick(
            folders.map((f) => ({ label: f.name, description: f.uri.fsPath, root: f.uri.fsPath })),
            { placeHolder: 'Select folder to import .env.* from', title: 'DotEnvUp' },
          ))?.root;
      if (!targetRoot) return;
      const files = await workspace.listPlaintextEnvFiles(targetRoot);
      if (files.length === 0) {
        vscode.window.showInformationMessage('DotEnvUp: No plaintext .env.* files found (excluding *.up).');
        return;
      }
      const succeeded: { srcPath: string; outPath: string; root: string }[] = [];
      for (const srcPath of files) {
        const ok = await importCmd.run(keystore, targetRoot, { silent: true, sourcePath: srcPath });
        if (ok) succeeded.push({ srcPath, outPath: path.join(path.dirname(srcPath), path.basename(srcPath) + '.up'), root: targetRoot });
      }
      if (succeeded.length === 0) {
        vscode.window.showWarningMessage('DotEnvUp: No files were imported.');
        return;
      }
      const lockSources = await vscode.window.showInformationMessage(
        `Imported ${succeeded.length} file(s) to .env.*.up. Lock (delete plaintext sources)?`,
        'Lock (delete sources)',
        'Keep',
      );
      if (lockSources === 'Lock (delete sources)') {
        for (const { srcPath, outPath, root } of succeeded) {
          await lockCmd.run(keystore, root, { envPath: srcPath, envUpPath: outPath, skipConfirm: true });
        }
        vscode.window.showInformationMessage(`DotEnvUp: ${succeeded.length} file(s) locked.`);
      }
      await refreshStatusBarFromFs();
    }),
    vscode.commands.registerCommand('dotenvup.showKeys', () => showKeysCmd.run()),
    vscode.commands.registerCommand('dotenvup.status', () => statusCmd.run(keystore)),
    vscode.commands.registerCommand('dotenvup.keyExport', () => keyExportCmd.run(keystore)),
    vscode.commands.registerCommand('dotenvup.keyImport', () => keyImportCmd.run(keystore)),
    vscode.commands.registerCommand('dotenvup.keyManagement', () => keyManagementCmd.run(context, keystore)),
    vscode.commands.registerCommand('dotenvup.keyStorageStatus', () => keyStorageStatusCmd.run(keystore)),
    vscode.commands.registerCommand('dotenvup.recoverKeyMismatch', () => recoverKeyMismatchCmd.run(keystore)),
    vscode.commands.registerCommand('dotenvup.recipientsList', () => recipientsListCmd.run()),
    vscode.commands.registerCommand('dotenvup.recipientsAdd', () => recipientsAddCmd.run()),
    vscode.commands.registerCommand('dotenvup.recipientsRemove', () => recipientsRemoveCmd.run()),
    vscode.commands.registerCommand('dotenvup.recipientsDiscover', () => recipientsDiscoverCmd.run()),
    vscode.commands.registerCommand('dotenvup.safeEdit', (uri?: vscode.Uri) => safeEditCmd.run(uri, keystore)),
    vscode.commands.registerCommand('dotenvup.unlockFromContext', async (uri?: vscode.Uri) => {
      const root = uri ? path.dirname(uri.fsPath) : undefined;
      await unlockCmd.run(keystore, root);
      await refreshStatusBarFromFs();
    }),
    vscode.commands.registerCommand('dotenvup.lockFromContext', async (uri?: vscode.Uri) => {
      const root = uri ? path.dirname(uri.fsPath) : undefined;
      await lockCmd.run(keystore, root);
      await refreshStatusBarFromFs();
    }),
    vscode.commands.registerCommand('dotenvup.copyMyPublicKey', async () => {
      const copyKeyCmd = await import('./commands/copyMyPublicKey');
      await copyKeyCmd.run(keystore);
    }),
    vscode.commands.registerCommand('dotenvup.encryptForRecipient', async (uri?: vscode.Uri) => {
      const encryptForCmd = await import('./commands/encryptForRecipient');
      await encryptForCmd.run(keystore, uri);
      await refreshStatusBarFromFs();
    }),
    vscode.commands.registerCommand('dotenvup.receiveShare', async () => {
      const receiveShareCmd = await import('./commands/receiveShare');
      await receiveShareCmd.run(keystore);
    }),
    vscode.commands.registerCommand('dotenvup.copyMcpConfig', async () => {
      const { run } = await import('./commands/copyMcpConfig');
      await run();
    }),
    vscode.commands.registerCommand('dotenvup.encryptForGitHub', async (uri?: vscode.Uri) => {
      const cmd = await import('./commands/encryptForGitHub');
      await cmd.run(keystore, uri);
    }),
    vscode.commands.registerCommand('dotenvup.decryptSealed', async (uri?: vscode.Uri) => {
      const cmd = await import('./commands/decryptSealed');
      await cmd.run(keystore, uri);
    }),
  );

  const watcherEnvUp = vscode.workspace.createFileSystemWatcher('**/.env.up');
  const watcherEnv = vscode.workspace.createFileSystemWatcher('**/.env');
  const refresh = () => void refreshStatusBarFromFs();
  watcherEnvUp.onDidCreate(refresh);
  watcherEnvUp.onDidChange(refresh);
  watcherEnvUp.onDidDelete(refresh);
  watcherEnv.onDidCreate(refresh);
  watcherEnv.onDidChange(refresh);
  context.subscriptions.push(watcherEnvUp, watcherEnv);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => void refreshStatusBarFromFs()),
  );
}

export function deactivate(): void {
  unlockCmd.disposeAutoLock();
  const roots = unlockCmd.getUnlockedRoots();
  void (async () => {
    const fsP = await import('fs/promises');
    const { isSafeToDelete } = await import('@dotenvup/format');
    for (const root of roots) {
      const envPath = path.join(root, '.env');
      const envUpPath = path.join(root, '.env.up');
      try {
        await fsP.access(envPath);
      } catch {
        continue;
      }

      const lockCmd = await import('./commands/lock');
      // Never delete .env if it has unsaved changes in the editor (user would lose the buffer)
      if (lockCmd.envFileIsDirty(envPath)) {
        logger.error('DotEnvUp: Left .env in place on close — file has unsaved changes. Save and use DotEnvUp: Import, then lock.');
        continue;
      }
      const privateKey = await keystore.getPrivateKey();
      const safeCheck = await isSafeToDelete(envUpPath, privateKey);
      if (!safeCheck.safe) {
        logger.error(`DotEnvUp: BLOCKED delete during deactivate — ${safeCheck.reason}`);
        continue;
      }
      // Never delete .env if it has changes not saved to .env.up (drift on disk)
      if (privateKey && (await lockCmd.envHasDrift(envPath, envUpPath, privateKey))) {
        logger.error('DotEnvUp: Left .env in place on close — it has changes not saved to .env.up. Save with DotEnvUp: Import, then lock.');
        continue;
      }
      try {
        await fsP.unlink(envPath);
        logger.debug('DotEnvUp: Deactivate removed .env', { root });
      } catch (err) {
        logger.error('DotEnvUp: Failed to remove .env during deactivate', err);
      }
    }
    roots.clear();
  })();
}

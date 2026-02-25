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
import * as logger from './logger';
import { getWorkspaceEnvStates } from './workspace';

let statusBarItem: vscode.StatusBarItem;
let keystore: ExtensionKeyStore;

async function refreshStatusBarFromFs(): Promise<void> {
  const states = await getWorkspaceEnvStates();
  const withEnvUp = states.filter((s) => s.state === 'locked' || s.state === 'unlocked');
  const unprotected = states.filter((s) => s.state === 'unprotected');

  if (withEnvUp.length === 0) {
    if (unprotected.length > 0) {
      statusBarItem.text = '$(warning) .env (unprotected)';
      statusBarItem.tooltip = 'Your .env has no encryption. Click to protect it (one click).';
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
    return;
  }

  statusBarItem.show();
  const expiresAt = unlockCmd.getUnlockExpiresAt();

  if (withEnvUp.length === 1) {
    const s = withEnvUp[0];
    if (s.state === 'unlocked') {
      updateStatusBar(statusBarItem, false, s.keyCount, expiresAt);
    } else {
      updateStatusBar(statusBarItem, true);
    }
    return;
  }

  const lockedCount = withEnvUp.filter((s) => s.state === 'locked').length;
  const unlockedCount = withEnvUp.filter((s) => s.state === 'unlocked').length;
  statusBarItem.text = `$(lock) DotEnvUp: ${lockedCount} locked, ${unlockedCount} unlocked`;
  statusBarItem.tooltip = withEnvUp.map((s) => `${s.name}: ${s.state}`).join('\n') + '\nClick to toggle.';
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
      const root = await workspace.getTargetWorkspaceRoot();

      if (root) {
        // Has .env.up — normal toggle between lock/unlock
        const envPath = path.join(root, '.env');
        const hasEnv = await fsP.access(envPath).then(() => true).catch(() => false);
        if (hasEnv) {
          await lockCmd.run(keystore, root);
        } else {
          await unlockCmd.run(keystore, root);
        }
      } else {
        // No .env.up — check for unprotected .env and offer one-click "Protect"
        const states = await workspace.getWorkspaceEnvStates();
        const unprotected = states.filter((s) => s.state === 'unprotected');
        if (unprotected.length === 0) return;

        const targetRoot = unprotected.length === 1
          ? unprotected[0].root
          : (await vscode.window.showQuickPick(
              unprotected.map((s) => ({ label: s.name, description: s.root, root: s.root })),
              { placeHolder: 'Select folder to protect', title: 'DotEnvUp' },
            ))?.root;
        if (!targetRoot) return;

        // Always require consent when no keypair exists (key may have been
        // deleted/lost since the last session — never silently generate + lock)
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
            if (!encryptAll) {
              return;
            }
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
          } catch (verifyErr) {
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
  );

  const watcherEnvUp = vscode.workspace.createFileSystemWatcher('**/.env.up');
  const watcherEnv = vscode.workspace.createFileSystemWatcher('**/.env');
  const refresh = () => void refreshStatusBarFromFs();
  watcherEnvUp.onDidCreate(refresh);
  watcherEnvUp.onDidChange(refresh);
  watcherEnvUp.onDidDelete(refresh);
  watcherEnv.onDidCreate(refresh);
  watcherEnv.onDidChange(refresh);
  watcherEnv.onDidDelete(refresh);
  context.subscriptions.push(watcherEnvUp, watcherEnv);
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

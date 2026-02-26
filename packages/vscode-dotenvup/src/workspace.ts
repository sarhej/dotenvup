/**
 * Multi-root workspace helpers for DotEnvUp
 *
 * Scans the entire workspace for any directory that contains .env or .env.up
 * (not only workspace folder roots), so status and lock/unlock cover all env files.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export type FolderState = 'locked' | 'unlocked' | 'unprotected' | 'none';

export interface WorkspaceEnvState {
  root: string;
  name: string;
  state: FolderState;
  keyCount?: number;
}

/** Exclude common non-project dirs when scanning for .env / .env.up */
const SCAN_EXCLUDE = '**/node_modules/**,**/.git/**';

/**
 * Compute folder state from presence of .env and .env.up.
 * Used by getWorkspaceEnvStates; exported for unit tests (state matrix).
 */
export function computeFolderState(hasEnv: boolean, hasEnvUp: boolean): FolderState {
  if (hasEnvUp && hasEnv) return 'unlocked';
  if (hasEnvUp) return 'locked';
  if (hasEnv) return 'unprotected';
  return 'none';
}

/**
 * Returns a short display name for an env root: workspace folder name if it's the
 * folder root, otherwise the relative path from the containing workspace folder.
 * Exported for tests.
 */
export function envRootDisplayName(root: string, workspaceFolders: readonly vscode.WorkspaceFolder[]): string {
  const normalizedRoot = path.normalize(root);
  for (const folder of workspaceFolders) {
    const folderPath = path.normalize(folder.uri.fsPath);
    if (normalizedRoot === folderPath) return folder.name;
    if (normalizedRoot.startsWith(folderPath + path.sep)) {
      const rel = path.relative(folderPath, normalizedRoot);
      return rel || folder.name;
    }
  }
  return path.basename(normalizedRoot) || '.';
}

/**
 * When the workspace has multiple roots, return only the folder for the "current"
 * context so we don't show envs from other roots. Single-root: use that root.
 * With multiple roots: use the folder containing the active editor, or the first
 * root if no editor is focused.
 */
function getEffectiveWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length <= 1) return workspaceFolders;
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const activeFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (activeFolder) return [activeFolder];
  }
  return [workspaceFolders[0]];
}

/**
 * Scan for .env / .env.up and return one state per directory.
 * When onlyWorkspaceRoot is true: only each workspace folder root (one entry per opened project).
 * Otherwise: all directories that contain .env or .env.up, including subfolders.
 * With multiple roots we only scan the active editor's folder (or the first root).
 */
export async function getWorkspaceEnvStates(): Promise<WorkspaceEnvState[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) return [];

  const effectiveFolders = getEffectiveWorkspaceFolders();
  const onlyRoot = vscode.workspace.getConfiguration('dotenvup').get<boolean>('onlyWorkspaceRoot', false);

  if (onlyRoot) {
    const result: WorkspaceEnvState[] = [];
    for (const folder of effectiveFolders) {
      const root = folder.uri.fsPath;
      const envPath = path.join(root, '.env');
      const envUpPath = path.join(root, '.env.up');
      let hasEnv = false;
      let hasEnvUp = false;
      try {
        await fs.access(envPath);
        hasEnv = true;
      } catch {}
      try {
        await fs.access(envUpPath);
        hasEnvUp = true;
      } catch {}
      const state = computeFolderState(hasEnv, hasEnvUp);
      let keyCount: number | undefined;
      if (state === 'unlocked') {
        try {
          const { parseHeader } = await import('@dotenvup/format');
          const content = await fs.readFile(envUpPath, 'utf8');
          const header = parseHeader(content);
          keyCount = header.keys.length;
        } catch {}
      }
      result.push({ root, name: folder.name, state, keyCount });
    }
    return result;
  }

  const envUris: vscode.Uri[] = [];
  const envUpUris: vscode.Uri[] = [];
  for (const folder of effectiveFolders) {
    const envPattern = new vscode.RelativePattern(folder, '**/.env');
    const envUpPattern = new vscode.RelativePattern(folder, '**/.env.up');
    envUris.push(...(await vscode.workspace.findFiles(envPattern, SCAN_EXCLUDE)));
    envUpUris.push(...(await vscode.workspace.findFiles(envUpPattern, SCAN_EXCLUDE)));
  }

  const dirsWithEnv = new Set(envUris.map((u) => path.normalize(path.dirname(u.fsPath))));
  const dirsWithEnvUp = new Set(envUpUris.map((u) => path.normalize(path.dirname(u.fsPath))));
  const allDirs = new Set<string>([...dirsWithEnv, ...dirsWithEnvUp]);

  const result: WorkspaceEnvState[] = [];
  for (const dir of allDirs) {
    const hasEnv = dirsWithEnv.has(dir);
    const hasEnvUp = dirsWithEnvUp.has(dir);
    const state = computeFolderState(hasEnv, hasEnvUp);
    let keyCount: number | undefined;
    if (state === 'unlocked') {
      try {
        const { parseHeader } = await import('@dotenvup/format');
        const envUpPath = path.join(dir, '.env.up');
        const content = await fs.readFile(envUpPath, 'utf8');
        const header = parseHeader(content);
        keyCount = header.keys.length;
      } catch {
        // ignore
      }
    }
    result.push({
      root: dir,
      name: envRootDisplayName(dir, effectiveFolders),
      state,
      keyCount,
    });
  }
  return result;
}

/**
 * List plaintext .env* files in a workspace root (excludes *.up).
 * Used when encryptAllEnvFiles is true.
 */
export async function listPlaintextEnvFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const name = e.name;
      if (!name.startsWith('.env')) continue;
      if (name.endsWith('.up')) continue;
      result.push(path.join(root, name));
    }
  } catch {
    // ignore (e.g. no read permission)
  }
  return result.sort();
}

export async function getTargetWorkspaceRoot(): Promise<string | null> {
  const states = await getWorkspaceEnvStates();
  const withEnvUp = states.filter((s) => s.state === 'locked' || s.state === 'unlocked');
  if (withEnvUp.length === 0) return null;
  if (withEnvUp.length === 1) return withEnvUp[0].root;
  const choice = await vscode.window.showQuickPick(
    withEnvUp.map((s) => ({
      label: s.name,
      description: s.root,
      root: s.root,
    })),
    { placeHolder: 'Select workspace folder', title: 'DotEnvUp' },
  );
  return choice?.root ?? null;
}

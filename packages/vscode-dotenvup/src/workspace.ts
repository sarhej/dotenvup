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

/** Directory names skipped by the fs walk (dependency, VCS, and build-output dirs). */
const FS_WALK_SKIP = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.turbo', '.cache', '.venv', 'venv', '__pycache__', 'target',
  '.vscode-test',
]);
/** Max directory depth for the fs walk (workspace root = 0). */
const FS_WALK_MAX_DEPTH = 6;
/** Max total directories visited per workspace folder, to bound cost on huge repos. */
const FS_WALK_MAX_DIRS = 5000;

/**
 * Walk the directory tree with fs and record every directory containing .env or .env.up.
 * findFiles / workspaceContains can miss gitignored files (and .env is almost always
 * gitignored), so this walk is the authoritative scan; findFiles results are merged in
 * as a bonus for anything the walk's depth/skip limits might miss.
 * Exported for unit tests (gitignored .env in subdirectories must be detected).
 */
export async function walkForEnvDirs(
  root: string,
  dirsWithEnv: Set<string>,
  dirsWithEnvUp: Set<string>,
): Promise<void> {
  let visited = 0;
  const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (visited++ >= FS_WALK_MAX_DIRS) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable dir (permissions etc.)
    }
    for (const e of entries) {
      if (e.isFile()) {
        if (e.name === '.env') dirsWithEnv.add(path.normalize(dir));
        else if (e.name === '.env.up') dirsWithEnvUp.add(path.normalize(dir));
      } else if (e.isDirectory() && depth < FS_WALK_MAX_DEPTH && !FS_WALK_SKIP.has(e.name)) {
        queue.push({ dir: path.join(dir, e.name), depth: depth + 1 });
      }
    }
  }
}

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
 * Return all workspace folders so every root is scanned for .env / .env.up.
 * Previously this was scoped to the active editor's folder, which hid .env.up
 * files in other roots of a multi-root workspace.
 */
function getEffectiveWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
  return vscode.workspace.workspaceFolders ?? [];
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

  const dirsWithEnv = new Set<string>();
  const dirsWithEnvUp = new Set<string>();

  // Primary scan: fs walk. findFiles / workspaceContains can omit gitignored files
  // (and .env usually is gitignored), so the walk is what guarantees detection.
  for (const folder of effectiveFolders) {
    await walkForEnvDirs(folder.uri.fsPath, dirsWithEnv, dirsWithEnvUp);
  }

  // Secondary scan: findFiles, to catch anything beyond the walk's depth/skip limits.
  for (const folder of effectiveFolders) {
    const envPattern = new vscode.RelativePattern(folder, '**/.env');
    const envUpPattern = new vscode.RelativePattern(folder, '**/.env.up');
    try {
      for (const u of await vscode.workspace.findFiles(envPattern, SCAN_EXCLUDE)) {
        dirsWithEnv.add(path.normalize(path.dirname(u.fsPath)));
      }
      for (const u of await vscode.workspace.findFiles(envUpPattern, SCAN_EXCLUDE)) {
        dirsWithEnvUp.add(path.normalize(path.dirname(u.fsPath)));
      }
    } catch {
      // findFiles unavailable (e.g. tests without search service); fs walk already covered us
    }
  }

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

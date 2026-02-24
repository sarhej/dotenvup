/**
 * Multi-root workspace helpers for DotEnvUp
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

export async function getWorkspaceEnvStates(): Promise<WorkspaceEnvState[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const result: WorkspaceEnvState[] = [];
  for (const folder of folders) {
    const root = folder.uri.fsPath;
    const envPath = path.join(root, '.env');
    const envUpPath = path.join(root, '.env.up');
    let hasEnv = false;
    let hasEnvUp = false;
    try {
      await fs.access(envPath);
      hasEnv = true;
    } catch {
      // ignore
    }
    try {
      await fs.access(envUpPath);
      hasEnvUp = true;
    } catch {
      // ignore
    }
    const state = computeFolderState(hasEnv, hasEnvUp);
    let keyCount: number | undefined;
    if (state === 'unlocked') {
      try {
        const { parseHeader } = await import('@dotenvup/format');
        const content = await fs.readFile(envUpPath, 'utf8');
        const header = parseHeader(content);
        keyCount = header.keys.length;
      } catch {
        // ignore
      }
    }
    result.push({ root, name: folder.name, state, keyCount });
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

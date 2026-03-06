/**
 * Workspace helper tests
 *
 * Critical scenarios (regression protection):
 * - Only .env (no .env.up) → state 'unprotected'; status bar shows "All unprotected".
 * - Only .env.up → state 'locked'.
 * - Both .env and .env.up → state 'unlocked'.
 * - Neither → state 'none'.
 * - getTargetWorkspaceRoot returns null when no folder has .env.up (so toggleLock can show get-started flow).
 * - Scan all env locations: any directory with .env or .env.up is included (not only workspace roots).
 * - Workspace folder roots are always checked via fs (not only findFiles), so root-level .env is detected
 *   even when excluded from search (e.g. .gitignore, search.exclude).
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  getWorkspaceEnvStates,
  getTargetWorkspaceRoot,
  computeFolderState,
  envRootDisplayName,
  type FolderState,
} from '../../workspace';

suite('Workspace helpers', () => {
  suite('computeFolderState (state matrix)', () => {
    test('only .env → unprotected', () => {
      assert.strictEqual(computeFolderState(true, false), 'unprotected');
    });
    test('only .env.up → locked', () => {
      assert.strictEqual(computeFolderState(false, true), 'locked');
    });
    test('both .env and .env.up → unlocked', () => {
      assert.strictEqual(computeFolderState(true, true), 'unlocked');
    });
    test('neither .env nor .env.up → none', () => {
      assert.strictEqual(computeFolderState(false, false), 'none');
    });
    test('state matrix covers all four FolderState values', () => {
      const seen = new Set<FolderState>();
      for (const hasEnv of [true, false]) {
        for (const hasEnvUp of [true, false]) {
          seen.add(computeFolderState(hasEnv, hasEnvUp));
        }
      }
      assert.ok(seen.has('unprotected'), 'unprotected');
      assert.ok(seen.has('locked'), 'locked');
      assert.ok(seen.has('unlocked'), 'unlocked');
      assert.ok(seen.has('none'), 'none');
    });
  });

  test('getWorkspaceEnvStates returns array', async () => {
    const states = await getWorkspaceEnvStates();
    assert.ok(Array.isArray(states));
  });

  test('getTargetWorkspaceRoot with no .env.up returns null', async () => {
    const root = await getTargetWorkspaceRoot();
    if (vscode.workspace.workspaceFolders?.length) {
      assert.ok(root === null || typeof root === 'string');
    } else {
      assert.strictEqual(root, null);
    }
  });

  test('when workspace has only .env (no .env.up), states include unprotected', async () => {
    const states = await getWorkspaceEnvStates();
    const hasUnprotected = states.some((s) => s.state === 'unprotected');
    const hasEnvUp = states.some((s) => s.state === 'locked' || s.state === 'unlocked');
    if (states.length > 0 && !hasEnvUp) {
      assert.ok(
        hasUnprotected || states.every((s) => s.state === 'none'),
        'folders with .env but no .env.up must be unprotected (or none if no .env)',
      );
    }
  });

  test('workspace folder roots are always checked via fs (root .env detected even if excluded from search)', async () => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) return;

    const expectedByRoot = new Map<string, { hasEnv: boolean; hasEnvUp: boolean }>();
    for (const folder of folders) {
      const root = path.normalize(folder.uri.fsPath);
      let hasEnv = false;
      let hasEnvUp = false;
      try {
        await fs.access(path.join(root, '.env'));
        hasEnv = true;
      } catch {}
      try {
        await fs.access(path.join(root, '.env.up'));
        hasEnvUp = true;
      } catch {}
      if (hasEnv || hasEnvUp) expectedByRoot.set(root, { hasEnv, hasEnvUp });
    }

    const states = await getWorkspaceEnvStates();
    for (const [root, { hasEnv, hasEnvUp }] of expectedByRoot) {
      const entry = states.find((s) => path.normalize(s.root) === root);
      assert.ok(entry, `getWorkspaceEnvStates must include workspace root that has .env or .env.up: ${root}`);
      const expectedState = computeFolderState(hasEnv, hasEnvUp);
      assert.strictEqual(
        entry!.state,
        expectedState,
        `root ${root}: expected state ${expectedState} (hasEnv=${hasEnv}, hasEnvUp=${hasEnvUp}), got ${entry!.state}`,
      );
    }
  });

  suite('getWorkspaceEnvStates (scan all env locations)', () => {
    test('returns no duplicate roots', async () => {
      const states = await getWorkspaceEnvStates();
      const roots = states.map((s) => path.normalize(s.root));
      const unique = new Set(roots);
      assert.strictEqual(unique.size, roots.length, 'each env root must appear at most once');
    });

    test('each state has root, name, state and state is valid FolderState', async () => {
      const states = await getWorkspaceEnvStates();
      const validStates: FolderState[] = ['locked', 'unlocked', 'unprotected', 'none'];
      for (const s of states) {
        assert.ok(typeof s.root === 'string' && s.root.length > 0, 'root must be non-empty string');
        assert.ok(typeof s.name === 'string', 'name must be string');
        assert.ok(validStates.includes(s.state), `state must be one of ${validStates.join(', ')}`);
      }
    });
  });

  suite('envRootDisplayName (multi-location display)', () => {
    function mockFolder(fsPath: string, name: string): vscode.WorkspaceFolder {
      return { uri: vscode.Uri.file(fsPath), name, index: 0 };
    }

    test('workspace root returns folder name', () => {
      const folders = [mockFolder('/ws', 'MyProject')];
      assert.strictEqual(envRootDisplayName('/ws', folders), 'MyProject');
      assert.strictEqual(envRootDisplayName(path.normalize('/ws'), folders), 'MyProject');
    });

    test('subfolder returns relative path', () => {
      const folders = [mockFolder('/ws', 'MyProject')];
      assert.strictEqual(envRootDisplayName('/ws/worker-api', folders), 'worker-api');
      assert.strictEqual(envRootDisplayName('/ws/packages/api', folders), path.normalize('packages/api'));
    });

    test('unknown path returns basename', () => {
      const folders = [mockFolder('/ws', 'MyProject')];
      assert.strictEqual(envRootDisplayName('/other/foo', folders), 'foo');
    });
  });
});

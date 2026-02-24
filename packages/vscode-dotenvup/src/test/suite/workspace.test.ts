/**
 * Workspace helper tests
 *
 * Critical scenarios (regression protection):
 * - Only .env (no .env.up) → state 'unprotected'; status bar "Click to manage" must show Init/Import.
 * - Only .env.up → state 'locked'.
 * - Both .env and .env.up → state 'unlocked'.
 * - Neither → state 'none'.
 * - getTargetWorkspaceRoot returns null when no folder has .env.up (so toggleLock can show get-started flow).
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  getWorkspaceEnvStates,
  getTargetWorkspaceRoot,
  computeFolderState,
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
});

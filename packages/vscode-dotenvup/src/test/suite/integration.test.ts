/**
 * Integration tests: workspace with .env.up, command execution,
 * and critical "only .env (unprotected)" scenario.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempWorkspace, MINIMAL_ENV_UP_HEADER } from '../fixtures';
import { computeFolderState } from '../../workspace';

suite('Integration', () => {
  let tempDir: string;

  suiteSetup(async () => {
    tempDir = await createTempWorkspace({ envUp: MINIMAL_ENV_UP_HEADER });
  });

  suiteTeardown(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('fixture dir has .env.up file', async () => {
    const envUpPath = path.join(tempDir, '.env.up');
    await fs.access(envUpPath);
    const content = await fs.readFile(envUpPath, 'utf8');
    assert.ok(content.includes('[keys]'));
  });

  test('extension activation with workspace present', async () => {
    const ext = vscode.extensions.getExtension('dotenvup.dotenvup');
    assert.ok(ext);
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });
});

suite('Integration — unprotected workspace (only .env)', () => {
  /**
   * Critical: when workspace has only .env and no .env.up, status bar shows
   * "All unprotected"; clicking opens QuickPick to protect. This suite
   * verifies the fixture and state logic.
   */
  let unprotectedDir: string;

  suiteSetup(async () => {
    unprotectedDir = await createTempWorkspace({ env: 'FOO=bar\nBAZ=qux' });
  });

  suiteTeardown(async () => {
    try {
      await fs.rm(unprotectedDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('unprotected fixture has .env and no .env.up', async () => {
    await fs.access(path.join(unprotectedDir, '.env'));
    await assert.rejects(fs.access(path.join(unprotectedDir, '.env.up')));
  });

  test('computeFolderState(hasEnv, no .env.up) is unprotected', () => {
    assert.strictEqual(
      computeFolderState(true, false),
      'unprotected',
      'only .env → unprotected; status bar shows "All unprotected"',
    );
  });
});

/**
 * Status bar tests
 *
 * Important: when workspace has only .env (unprotected), status bar shows
 * "All unprotected"; clicking runs dotenvup.toggleLock which shows
 * QuickPick to protect. When all locations have .env.up: "All protected".
 * When some do and some don't: "Partially protected".
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { createStatusBar, updateStatusBar } from '../../statusBar';

suite('Status bar', () => {
  test('createStatusBar returns item with command (used for lock/unlock and get-started)', () => {
    const item = createStatusBar(() => {});
    assert.ok(item);
    assert.strictEqual(item.command, 'dotenvup.toggleLock');
  });

  test('updateStatusBar locked sets text and tooltip', () => {
    const item = createStatusBar(() => {});
    updateStatusBar(item, true);
    assert.ok(item.text.includes('All protected'));
    assert.ok(String(item.tooltip ?? '').includes('unlock'));
  });

  test('updateStatusBar unlocked sets text', () => {
    const item = createStatusBar(() => {});
    updateStatusBar(item, false, 3);
    assert.ok(item.text.includes('All protected'));
    assert.ok(item.text.includes('3'));
  });

  test('updateStatusBar with expiresAt sets tooltip', () => {
    const item = createStatusBar(() => {});
    const future = Date.now() + 120_000;
    updateStatusBar(item, false, 1, future);
    assert.ok(String(item.tooltip ?? '').includes('Auto-locks'));
  });
});

/**
 * DotEnvUp — Status bar (lock/unlock indicator)
 */

import * as vscode from 'vscode';

export function createStatusBar(onToggle: () => void): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'dotenvup.toggleLock';
  return item;
}

function formatCountdown(expiresAt: number): string {
  const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  if (m > 0) return `Auto-locks in ${m}m ${s}s`;
  return `Auto-locks in ${s}s`;
}

export function updateStatusBar(
  item: vscode.StatusBarItem,
  isLocked: boolean,
  keyCount?: number,
  expiresAt?: number | null,
): void {
  item.backgroundColor = undefined;
  if (isLocked) {
    item.text = '$(lock) .env.up locked';
    item.tooltip = 'Click to unlock .env.up';
  } else {
    item.text = keyCount !== undefined ? `$(unlock) .env.up unlocked (${keyCount} keys)` : '$(unlock) .env.up unlocked';
    if (expiresAt != null && expiresAt > Date.now()) {
      item.tooltip = formatCountdown(expiresAt) + ' — Click to lock';
      if (expiresAt - Date.now() < 60_000) {
        item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      }
    } else {
      item.tooltip = 'Click to lock .env.up';
    }
  }
}

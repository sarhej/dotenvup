/**
 * DotEnvUp — VS Code Extension Logger
 */

import * as vscode from 'vscode';

const SECRET_PATTERNS = /password|secret|key|token|credential|auth/i;

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('DotEnvUp');
  }
  return outputChannel;
}

export function info(msg: string): void {
  getOutputChannel().appendLine(`[info] ${msg}`);
  vscode.window.showInformationMessage(msg);
}

export function warn(msg: string): void {
  getOutputChannel().appendLine(`[warn] ${scrubMessage(msg)}`);
  vscode.window.showWarningMessage(scrubMessage(msg));
}

export function error(msg: string, err?: unknown): void {
  const scrubbedMsg = scrubMessage(msg);
  let detail = '';
  if (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    detail = `: ${scrubMessage(errMsg)}`;
  }
  getOutputChannel().appendLine(`[error] ${scrubbedMsg}${detail}`);
  vscode.window.showErrorMessage(`${scrubbedMsg}${detail}`);
}

export function debug(msg: string, data?: Record<string, unknown>): void {
  const safe = data ? scrubObject(data) : {};
  getOutputChannel().appendLine(`[debug] ${scrubMessage(msg)} ${Object.keys(safe).length ? JSON.stringify(safe) : ''}`);
}

/**
 * Redact key names that look like secrets in a string.
 */
export function scrubMessage(msg: string): string {
  return msg.replace(/[A-Z0-9_]{3,}/g, (match) => {
    if (SECRET_PATTERNS.test(match)) return '[redacted]';
    return match;
  });
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_PATTERNS.test(k)) {
      out[k] = '[redacted]';
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out[k] = scrubObject(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

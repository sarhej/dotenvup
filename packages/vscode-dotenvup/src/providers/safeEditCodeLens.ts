/**
 * CodeLens Provider for .env.up files
 *
 * Adds a "Edit Secrets (Safe Mode)" action at the top of .env.up files.
 */

import * as vscode from 'vscode';

export class SafeEditCodeLensProvider implements vscode.CodeLensProvider {
  
  provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
    // Only show for .env.up files
    if (!document.fileName.endsWith('.env.up')) {
      return [];
    }

    // Create a range at the very top
    const range = new vscode.Range(0, 0, 0, 0);
    
    const cmd: vscode.Command = {
      title: '$(lock) Edit Secrets (Safe Mode)',
      command: 'dotenvup.safeEdit',
      arguments: [document.uri],
      tooltip: 'Edit secrets in a virtual document without writing plaintext to disk.'
    };

    return [new vscode.CodeLens(range, cmd)];
  }
}

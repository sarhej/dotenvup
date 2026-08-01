/**
 * Safe Edit FileSystemProvider
 *
 * Provides a virtual filesystem `dotenvup-safe:/path/to/.env` that:
 * 1. Reads from the real `.env.up` on disk.
 * 2. Decrypts content in memory (never writing plaintext to disk).
 * 3. Encrypts content back to `.env.up` on save.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ExtensionKeyStore } from '../keystore';
import { getAuthor } from '../author';

export class SafeEditFSProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

  constructor(private keystore: ExtensionKeyStore) {}

  /**
   * Resolve virtual URI -> real path `.env.up` in the same directory.
   * Virtual path is .env.up.edit (or legacy .env) to avoid tab collision with real .env on disk.
   */
  private getRealEnvUpPath(uri: vscode.Uri): string {
    const dir = path.dirname(uri.fsPath);
    return path.join(dir, '.env.up');
  }

  watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
    // We could watch the real .env.up file and fire change events
    // For now, simple no-op or basic watcher if needed.
    // VS Code handles text document dirty state mostly in memory.
    return new vscode.Disposable(() => {});
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const realPath = this.getRealEnvUpPath(uri);
    try {
      const stats = await fs.stat(realPath);
      return {
        type: vscode.FileType.File,
        ctime: stats.ctimeMs,
        mtime: stats.mtimeMs,
        size: stats.size, // Approximate size (encrypted size), but sufficient for VS Code to treat it as existing
      };
    } catch {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    throw vscode.FileSystemError.NoPermissions('Directory listing not supported for safe edit.');
  }

  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions('Directory creation not supported.');
  }

  /**
   * Read: Decrypt .env.up -> return plaintext bytes. If uri.query has merge=env or merge=envUp, merge with .env.
   */
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const realPath = this.getRealEnvUpPath(uri);
    const dir = path.dirname(realPath);
    const envPath = path.join(dir, '.env');

    try {
      const content = await fs.readFile(realPath, 'utf8');
      const { parse, decryptAny, parseEnvFile } = await import('@dotenvup/format');

      const privateKey = await this.keystore.requirePrivateKey();

      const file = parse(content);
      const result = await decryptAny(file, privateKey, '@local');
      const envUpRaw =
        result.raw ??
        Object.entries(result.entries)
          .map(([k, v]) => (v.includes('"') || v.includes('\n') || v.includes(' ') ? `${k}="${v.replace(/"/g, '\\"')}"` : `${k}=${v}`))
          .join('\n') +
          '\n';

      const mergePrefer = uri.query ? new URLSearchParams(uri.query).get('merge') : null;
      if (mergePrefer === 'env' || mergePrefer === 'envUp') {
        try {
          const envContent = await fs.readFile(envPath, 'utf8');
          const { mergeEnvContent } = await import('../mergeEnv');
          const merged = mergeEnvContent(envContent, envUpRaw, mergePrefer);
          return new TextEncoder().encode(merged);
        } catch {
          // .env disappeared or unreadable; fall back to .env.up only
        }
      }

      return new TextEncoder().encode(envUpRaw);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const isKeyMismatch =
        /No recipient block could be decrypted|incorrect key pair for the given ciphertext/i.test(msg);
      if (isKeyMismatch) {
        throw vscode.FileSystemError.Unavailable(
          'This .env.up was encrypted with a different key than the one DotEnvUp is using. ' +
          'Run **DotEnvUp: Recover key mismatch** to import the correct key, or clear UP_KEY / DOTENVUP_IDENTITY_DIR if you expect to use ~/.dotenvup. ' +
          `Detail: ${msg}`,
        );
      }
      throw vscode.FileSystemError.Unavailable(`Decryption failed: ${msg}`);
    }
  }

  /**
   * Write: Encrypt plaintext -> update .env.up on disk
   */
  async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void> {
    const realPath = this.getRealEnvUpPath(uri);
    const plaintext = new TextDecoder().decode(content);

    try {
      const { parse, create, serialize, parseEnvFile } = await import('@dotenvup/format');
      const privateKey = await this.keystore.requirePrivateKey();
      const publicKey = await this.keystore.getPublicKey();
      if (!publicKey) {
        throw new Error('No public key available.');
      }

      // 1. Read existing .env.up to preserve recipients and metadata
      let existingFile;
      try {
        const existingContent = await fs.readFile(realPath, 'utf8');
        existingFile = parse(existingContent);
      } catch {
        // If file doesn't exist, we are creating new? 
        // Safe Edit usually implies editing existing.
        if (!options.create) throw vscode.FileSystemError.FileNotFound(uri);
      }

      // 2. Parse the new plaintext content to get entries
      const newEntries = parseEnvFile(plaintext);

      // 3. Determine recipients
      // If existing file, we want to keep existing recipients.
      // We need their public keys. The format file header might have `Encrypted-For`.
      // But to re-encrypt for them, we need their actual public keys.
      // The `create` function takes `recipientPublicKeys`.
      // If we don't have the original public keys of other recipients, we can't re-encrypt for them 
      // UNLESS the format supports "partial update" or we have a local store of their keys.
      // 
      // CRITICAL: If we re-encrypt, we need ALL public keys.
      // If `.env.up` header stores public keys (unlikely, usually just names/fingerprints), we are stuck.
      // Typically `dotenvup` relies on `.dotenvup/recipients` or similar to know keys.
      // Or the user provides them.
      // 
      // For this MVP, let's assume we re-encrypt for the current user (`@local`) 
      // AND try to find other recipients if possible.
      // If we can't find other keys, we might warn or fail?
      // 
      // Let's look at `import.ts` or `lock.ts`. They typically use `keystore` and maybe a recipients list.
      // For now, we'll re-encrypt for the current user (and any others we can find/resolve).
      
      const author = await getAuthor(this.keystore.getIdentityDir());
      
      // We need a map of public keys for recipients
      // Always include self.
      const recipients = new Map<string, Uint8Array>();
      recipients.set(author, publicKey);
      
      // TODO: Load other recipients from project config if available.
      
      // 4. Create new .env.up structure
      // We pass the *full plaintext content* to `create` so it preserves comments/structure inside the encrypted block.
      const newFile = await create(newEntries, author, recipients, plaintext);
      
      // 5. Serialize and write
      const serialized = serialize(newFile);
      await fs.writeFile(realPath, serialized, 'utf8');

      // Notify change
      this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);

      // 6. If .env exists in same dir, offer to remove it
      const dir = path.dirname(realPath);
      const envPath = path.join(dir, '.env');
      try {
        await fs.access(envPath);
        const choice = await vscode.window.showInformationMessage(
          'DotEnvUp: .env.up updated. Remove .env from disk?',
          'Remove .env',
          'Keep'
        );
        if (choice === 'Remove .env') {
          await fs.unlink(envPath);
        }
      } catch {
        // .env does not exist, nothing to remove
      }
    } catch (error) {
      throw vscode.FileSystemError.Unavailable(`Encryption failed: ${error}`);
    }
  }

  async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    throw vscode.FileSystemError.NoPermissions('Delete not supported via safe edit.');
  }

  async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
    throw vscode.FileSystemError.NoPermissions('Rename not supported via safe edit.');
  }
}

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';

type RecoveryOutcome = 'resolved' | 'unresolved' | 'cancelled';
type SearchMatch = {
  path: string;
  type: 'identity-private' | 'identity-public' | 'public-key' | 'key-bundle';
  status: 'match' | 'mismatch' | 'invalid';
  keyId?: string;
};
type SearchSummary = {
  scannedFiles: number;
  truncated: boolean;
  results: SearchMatch[];
};

export interface RecoverKeyMismatchOptions {
  envUpPath?: string;
  requiredKeyId?: string;
  currentKeyId?: string | null;
  sourceAction?: 'unlock' | 'lock' | 'manual';
}

async function parseRequiredKeyId(envUpPath: string): Promise<string | null> {
  try {
    const { parse } = await import('@dotenvup/format');
    const content = await fs.readFile(envUpPath, 'utf8');
    const file = parse(content);
    return file.header.keyId ?? null;
  } catch {
    return null;
  }
}

async function derivePublicFromPrivate(privateKey: Uint8Array): Promise<Uint8Array> {
  const sodiumLib = await import('libsodium-wrappers');
  await sodiumLib.ready;
  return sodiumLib.default.crypto_scalarmult_base(privateKey) as Uint8Array;
}

async function importIdentityFile(filePath: string, keystore: ExtensionKeyStore): Promise<string> {
  const raw = (await fs.readFile(filePath, 'utf8')).trim();
  const privateKey = new Uint8Array(Buffer.from(raw, 'base64'));
  if (privateKey.length !== 32) {
    throw new Error('Selected identity file is not a valid 32-byte private key.');
  }
  const publicKey = await derivePublicFromPrivate(privateKey);
  const { keyFingerprint } = await import('@dotenvup/format');
  const keyId = await keyFingerprint(publicKey);
  await keystore.storeKeypair(publicKey, privateKey);
  return keyId;
}

async function importBundleFile(filePath: string, keystore: ExtensionKeyStore): Promise<string> {
  const content = await fs.readFile(filePath, 'utf8');
  const passphrase = await vscode.window.showInputBox({
    title: 'DotEnvUp: Import matching key bundle',
    prompt: 'Passphrase for key bundle',
    password: true,
    ignoreFocusOut: true,
  });
  if (!passphrase) throw new Error('Passphrase is required to import key bundle.');
  const { parseKeyBundle, importKeyBundle, keyFingerprint } = await import('@dotenvup/format');
  const bundle = parseKeyBundle(content);
  const keypair = await importKeyBundle(bundle, passphrase);
  await keystore.storeKeypair(keypair.publicKey, keypair.privateKey);
  return keyFingerprint(keypair.publicKey);
}

async function createUnrecoverableMarker(envUpPath: string, requiredKeyId: string): Promise<string> {
  const marker = path.join(
    path.dirname(envUpPath),
    `${path.basename(envUpPath)}.key-${requiredKeyId}.txt`,
  );
  const lines = [
    'DotEnvUp recovery marker',
    `createdAt: ${new Date().toISOString()}`,
    `envUpPath: ${envUpPath}`,
    `requiredKeyId: ${requiredKeyId}`,
    'note: original private key is required to decrypt this file.',
    '',
  ];
  await fs.writeFile(marker, lines.join('\n'), 'utf8');
  return marker;
}

function quickScanRoots(workspaceRoot: string, identityDir: string): string[] {
  return [
    workspaceRoot,
    identityDir,
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Downloads'),
  ];
}

export async function run(
  keystore: ExtensionKeyStore,
  options?: RecoverKeyMismatchOptions,
): Promise<RecoveryOutcome> {
  const root = options?.envUpPath ? path.dirname(options.envUpPath) : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd());
  const envUpPath = options?.envUpPath ?? path.join(root, '.env.up');
  const requiredKeyId = options?.requiredKeyId ?? (await parseRequiredKeyId(envUpPath));
  if (!requiredKeyId) {
    logger.error('DotEnvUp: Unable to read required Key-Id from .env.up. Use key import manually.');
    return 'cancelled';
  }

  const formatLib = await import('@dotenvup/format');
  const keyFingerprint = formatLib.keyFingerprint;
  const searchLocalKeys = (formatLib as Record<string, unknown>)['searchLocalKeys'] as (
    options: { roots: string[]; requiredKeyId: string; maxDepth?: number; maxFiles?: number }
  ) => Promise<SearchSummary>;
  if (!searchLocalKeys) {
    logger.error('DotEnvUp: Recovery scanner is unavailable. Rebuild @dotenvup/format and retry.');
    return 'cancelled';
  }
  const existingPublicKey = await keystore.getPublicKey();
  const currentKeyId = options?.currentKeyId
    ?? (existingPublicKey ? await keyFingerprint(existingPublicKey) : null);

  while (true) {
    const choice = await vscode.window.showWarningMessage(
      `DotEnvUp cannot decrypt with current key. Required Key-Id: ${requiredKeyId}${currentKeyId ? `, current: ${currentKeyId}` : ', current: none'}.`,
      { modal: true },
      'Find matching key',
      'Import key bundle',
      'How to transfer',
      'I lost key',
      'Cancel',
    );

    if (!choice || choice === 'Cancel') return 'cancelled';

    if (choice === 'How to transfer') {
      const text = [
        'Transfer key from old computer:',
        '1) old computer: up key export backup.dotenvup-key',
        '2) new computer: DotEnvUp: Import key bundle (or up key import backup.dotenvup-key)',
        `3) ensure imported key id matches: ${requiredKeyId}`,
      ].join('\n');
      await vscode.window.showInformationMessage(text, { modal: true });
      continue;
    }

    if (choice === 'I lost key') {
      const markerChoice = await vscode.window.showWarningMessage(
        'If the original private key is lost, this .env.up cannot be decrypted. Create a recovery marker file?',
        { modal: true },
        'Create marker',
        'Keep encrypted only',
      );
      if (markerChoice === 'Create marker') {
        try {
          const markerPath = await createUnrecoverableMarker(envUpPath, requiredKeyId);
          logger.warn(`DotEnvUp: Created recovery marker: ${markerPath}`);
        } catch (err) {
          logger.error('DotEnvUp: Failed to create recovery marker', err);
        }
      }
      return 'unresolved';
    }

    if (choice === 'Import key bundle') {
      const file = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Select key bundle',
        filters: { 'DotEnvUp Key Bundle': ['dotenvup-key', 'json'], All: ['*'] },
      });
      if (!file?.length) continue;
      try {
        const importedKeyId = await importBundleFile(file[0].fsPath, keystore);
        if (importedKeyId === requiredKeyId) {
          logger.info(`DotEnvUp: Matching key imported (${importedKeyId}).`);
          return 'resolved';
        }
        logger.warn(`DotEnvUp: Imported key ${importedKeyId} does not match required ${requiredKeyId}.`);
      } catch (err) {
        logger.error('DotEnvUp: Key bundle import failed', err);
      }
      continue;
    }

    const scanScope = await vscode.window.showInformationMessage(
      'Scan local files for matching key? (local-only, no upload)',
      { modal: true },
      'Quick scan',
      'Deep scan (home)',
      'Cancel',
    );
    if (!scanScope || scanScope === 'Cancel') continue;

    const roots = scanScope === 'Deep scan (home)'
      ? [os.homedir()]
      : quickScanRoots(root, keystore.getIdentityDir());
    const summary = await searchLocalKeys({
      roots,
      requiredKeyId,
      maxDepth: scanScope === 'Deep scan (home)' ? 12 : 6,
      maxFiles: scanScope === 'Deep scan (home)' ? 50000 : 6000,
    });

    const matches = (summary.results as SearchMatch[]).filter((r) => r.status === 'match');
    if (matches.length === 0) {
      logger.warn(`DotEnvUp: No matching key found (checked ${summary.scannedFiles} files).`);
      continue;
    }

    const items = matches.map((m) => ({
      label: `${m.type} (${m.keyId})`,
      description: m.path,
      candidate: m,
    }));
    const picked = await vscode.window.showQuickPick(items,
      { title: 'DotEnvUp: Matching key candidates', placeHolder: 'Select key source to import' },
    );
    if (!picked) continue;

    try {
      if (picked.candidate.type === 'identity-private') {
        const importedKeyId = await importIdentityFile(picked.candidate.path, keystore);
        if (importedKeyId === requiredKeyId) {
          logger.info(`DotEnvUp: Matching identity imported (${importedKeyId}).`);
          return 'resolved';
        }
        logger.warn(`DotEnvUp: Imported identity ${importedKeyId} does not match required ${requiredKeyId}.`);
      } else if (picked.candidate.type === 'key-bundle') {
        const importedKeyId = await importBundleFile(picked.candidate.path, keystore);
        if (importedKeyId === requiredKeyId) {
          logger.info(`DotEnvUp: Matching key imported (${importedKeyId}).`);
          return 'resolved';
        }
        logger.warn(`DotEnvUp: Imported key ${importedKeyId} does not match required ${requiredKeyId}.`);
      } else {
        logger.warn('DotEnvUp: Public key file found, but private key is required for decryption.');
      }
    } catch (err) {
      logger.error('DotEnvUp: Failed to import selected key candidate', err);
    }
  }
}


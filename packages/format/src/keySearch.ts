import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Dirent } from 'fs';
import { keyFingerprint, initSodium } from './crypto.js';
import { parseKeyBundle } from './keyBundle.js';

type SearchStatus = 'match' | 'mismatch' | 'candidate' | 'invalid';
type CandidateType = 'identity-private' | 'identity-public' | 'public-key' | 'key-bundle';

export interface KeySearchMatch {
  path: string;
  type: CandidateType;
  status: SearchStatus;
  keyId?: string;
  error?: string;
}

export interface KeySearchOptions {
  roots: string[];
  requiredKeyId?: string;
  maxDepth?: number;
  maxFiles?: number;
}

export interface KeySearchSummary {
  requiredKeyId?: string;
  scannedFiles: number;
  truncated: boolean;
  results: KeySearchMatch[];
}

function isLikelyCandidate(filename: string): boolean {
  return (
    filename === 'identity'
    || filename === 'identity.pub'
    || filename.endsWith('.pub')
    || filename.endsWith('.dotenvup-key')
    || filename.endsWith('.keybundle')
  );
}

function normalizeRoots(roots: string[]): string[] {
  const out = new Set<string>();
  for (const root of roots) {
    const trimmed = root.trim();
    if (!trimmed) continue;
    const expanded = trimmed.startsWith('~')
      ? path.join(os.homedir(), trimmed.slice(1))
      : trimmed;
    out.add(path.resolve(expanded));
  }
  return Array.from(out);
}

async function derivePublicFromPrivate(privateKey: Uint8Array): Promise<Uint8Array> {
  const sodiumLib = await import('libsodium-wrappers');
  await sodiumLib.ready;
  const s = sodiumLib.default;
  return s.crypto_scalarmult_base(privateKey) as Uint8Array;
}

function classifyKeyId(keyId: string, requiredKeyId?: string): SearchStatus {
  if (!requiredKeyId) return 'candidate';
  return keyId === requiredKeyId ? 'match' : 'mismatch';
}

async function inspectCandidate(filePath: string, requiredKeyId?: string): Promise<KeySearchMatch> {
  const filename = path.basename(filePath);
  try {
    if (filename === 'identity') {
      const raw = (await fs.readFile(filePath, 'utf8')).trim();
      const privateKey = new Uint8Array(Buffer.from(raw, 'base64'));
      if (privateKey.length !== 32) {
        return { path: filePath, type: 'identity-private', status: 'invalid', error: 'private key is not 32 bytes' };
      }
      const publicKey = await derivePublicFromPrivate(privateKey);
      const keyId = await keyFingerprint(publicKey);
      return { path: filePath, type: 'identity-private', status: classifyKeyId(keyId, requiredKeyId), keyId };
    }

    if (filename === 'identity.pub') {
      const raw = (await fs.readFile(filePath, 'utf8')).trim();
      const publicKey = new Uint8Array(Buffer.from(raw, 'base64'));
      if (publicKey.length !== 32) {
        return { path: filePath, type: 'identity-public', status: 'invalid', error: 'public key is not 32 bytes' };
      }
      const keyId = await keyFingerprint(publicKey);
      return { path: filePath, type: 'identity-public', status: classifyKeyId(keyId, requiredKeyId), keyId };
    }

    if (filename.endsWith('.dotenvup-key') || filename.endsWith('.keybundle')) {
      const raw = await fs.readFile(filePath, 'utf8');
      const bundle = parseKeyBundle(raw);
      const pub = new Uint8Array(Buffer.from(bundle.publicKey, 'base64'));
      if (pub.length !== 32) {
        return { path: filePath, type: 'key-bundle', status: 'invalid', error: 'bundle public key is not 32 bytes' };
      }
      const keyId = await keyFingerprint(pub);
      return { path: filePath, type: 'key-bundle', status: classifyKeyId(keyId, requiredKeyId), keyId };
    }

    if (filename.endsWith('.pub')) {
      const raw = (await fs.readFile(filePath, 'utf8')).trim();
      const publicKey = new Uint8Array(Buffer.from(raw, 'base64'));
      if (publicKey.length !== 32) {
        return { path: filePath, type: 'public-key', status: 'invalid', error: 'public key is not 32 bytes' };
      }
      const keyId = await keyFingerprint(publicKey);
      return { path: filePath, type: 'public-key', status: classifyKeyId(keyId, requiredKeyId), keyId };
    }

    return { path: filePath, type: 'public-key', status: 'invalid', error: 'unsupported candidate type' };
  } catch (err) {
    return {
      path: filePath,
      type: filename.endsWith('.dotenvup-key') || filename.endsWith('.keybundle') ? 'key-bundle' : 'public-key',
      status: 'invalid',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function searchLocalKeys(options: KeySearchOptions): Promise<KeySearchSummary> {
  await initSodium();
  const roots = normalizeRoots(options.roots);
  const maxDepth = options.maxDepth ?? 6;
  const maxFiles = options.maxFiles ?? 5000;
  const queue: Array<{ dir: string; depth: number }> = roots.map((dir) => ({ dir, depth: 0 }));
  const results: KeySearchMatch[] = [];
  let scannedFiles = 0;
  let truncated = false;

  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (depth > maxDepth) continue;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.vscode-test')) continue;
        queue.push({ dir: fullPath, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;

      scannedFiles += 1;
      if (scannedFiles > maxFiles) {
        truncated = true;
        break;
      }
      if (!isLikelyCandidate(entry.name)) continue;
      results.push(await inspectCandidate(fullPath, options.requiredKeyId));
    }

    if (truncated) break;
  }

  return {
    requiredKeyId: options.requiredKeyId,
    scannedFiles,
    truncated,
    results,
  };
}

export async function discoverLocalKeyCandidates(
  options: Omit<KeySearchOptions, 'requiredKeyId'>,
): Promise<KeySearchSummary> {
  return searchLocalKeys({ ...options, requiredKeyId: undefined });
}


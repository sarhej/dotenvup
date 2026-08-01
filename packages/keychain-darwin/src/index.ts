/**
 * Node bridge to the signed dotenvup-keychain helper (macOS only).
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KEYCHAIN_SERVICE = 'com.dotenvup.wrapping-key';
export const HELPER_NAME = 'dotenvup-keychain';

export class AuthCancelledError extends Error {
  readonly code = 'AUTH_CANCELLED';
  constructor(message = 'Authentication cancelled') {
    super(message);
    this.name = 'AuthCancelledError';
  }
}

export class KeychainHelperError extends Error {
  readonly code: string;
  readonly exitCode: number;
  constructor(message: string, exitCode: number, code = 'KEYCHAIN_ERROR') {
    super(message);
    this.name = 'KeychainHelperError';
    this.exitCode = exitCode;
    this.code = code;
  }
}

export interface ProbeResult {
  version: string;
  service: string;
  biometryAvailable: boolean;
  ownerAuthAvailable: boolean;
  biometryType: string;
}

export interface KeychainDarwinHelper {
  binaryPath: string;
  probe(): Promise<ProbeResult>;
  set(account: string, wrappingKey: Uint8Array): Promise<void>;
  get(account: string): Promise<Uint8Array>;
  has(account: string): Promise<boolean>;
  delete(account: string): Promise<void>;
}

function packageRoot(): string {
  // Prefer env: when JS is bundled into the VS Code extension, import.meta / require.resolve break.
  const fromEnv = process.env.DOTENVUP_KEYCHAIN_HELPER?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return path.resolve(path.dirname(fromEnv), '..');
  }

  try {
    const metaUrl = import.meta.url;
    if (typeof metaUrl === 'string' && metaUrl.length > 0) {
      const require = createRequire(metaUrl);
      try {
        return path.dirname(require.resolve('@dotenvup/keychain-darwin/package.json'));
      } catch {
        return path.resolve(path.dirname(fileURLToPath(metaUrl)), '..');
      }
    }
  } catch {
    // bundled CJS with empty import.meta
  }

  // Last resort: walk from cwd (CLI monorepo / linked installs)
  const fromCwd = path.resolve(process.cwd(), 'node_modules/@dotenvup/keychain-darwin');
  if (fs.existsSync(path.join(fromCwd, 'package.json'))) return fromCwd;
  return path.resolve(process.cwd());
}

/** Resolve helper binary path (override with DOTENVUP_KEYCHAIN_HELPER). */
export function resolveHelperPath(): string | null {
  const fromEnv = process.env.DOTENVUP_KEYCHAIN_HELPER?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidate = path.join(packageRoot(), 'bin', HELPER_NAME);
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

export function isDarwin(): boolean {
  return process.platform === 'darwin';
}

interface RunResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

function runHelper(
  binaryPath: string,
  args: string[],
  stdin?: Buffer,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code: code ?? 2,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks).toString('utf8').trim(),
      });
    });
    if (stdin && stdin.length > 0) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

function throwForFailure(result: RunResult, action: string): never {
  if (result.stderr.includes('Authentication cancelled')) {
    throw new AuthCancelledError(result.stderr || 'Authentication cancelled');
  }
  throw new KeychainHelperError(
    result.stderr || `dotenvup-keychain ${action} failed (exit ${result.code})`,
    result.code,
  );
}

export function createHelper(binaryPath?: string): KeychainDarwinHelper | null {
  if (!isDarwin()) return null;
  const resolved = binaryPath ?? resolveHelperPath();
  if (!resolved) return null;

  return {
    binaryPath: resolved,

    async probe(): Promise<ProbeResult> {
      const result = await runHelper(resolved, ['probe']);
      if (result.code !== 0) throwForFailure(result, 'probe');
      const parsed = JSON.parse(result.stdout.toString('utf8')) as ProbeResult;
      return parsed;
    },

    async set(account: string, wrappingKey: Uint8Array): Promise<void> {
      if (wrappingKey.length !== 32) {
        throw new KeychainHelperError('Wrapping key must be 32 bytes', 1, 'INVALID_KEY');
      }
      const b64 = Buffer.from(wrappingKey).toString('base64') + '\n';
      const result = await runHelper(resolved, ['set', account], Buffer.from(b64, 'utf8'));
      if (result.code !== 0) throwForFailure(result, 'set');
    },

    async get(account: string): Promise<Uint8Array> {
      const result = await runHelper(resolved, ['get', account]);
      if (result.code !== 0) {
        if (result.stderr.includes('Authentication cancelled')) {
          throw new AuthCancelledError(result.stderr);
        }
        throwForFailure(result, 'get');
      }
      const text = result.stdout.toString('utf8').trim();
      const buf = Buffer.from(text, 'base64');
      if (buf.length !== 32) {
        throw new KeychainHelperError('Helper returned invalid wrapping key length', 2);
      }
      return new Uint8Array(buf);
    },

    async has(account: string): Promise<boolean> {
      const result = await runHelper(resolved, ['has', account]);
      if (result.code === 0) return true;
      if (result.code === 1) return false;
      throwForFailure(result, 'has');
    },

    async delete(account: string): Promise<void> {
      const result = await runHelper(resolved, ['delete', account]);
      if (result.code !== 0) throwForFailure(result, 'delete');
    },
  };
}

/** True when platform is darwin and the helper binary is present. */
export async function available(): Promise<boolean> {
  const helper = createHelper();
  if (!helper) return false;
  try {
    await helper.probe();
    return true;
  } catch {
    return false;
  }
}

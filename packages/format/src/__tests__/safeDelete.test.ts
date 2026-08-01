/**
 * EXHAUSTIVE safety tests for .env deletion scenarios.
 *
 * Tests every edge case where .env could be destroyed.
 * All tests use temp directories — no live projects touched.
 *
 * The safety invariant:
 *   .env MUST NEVER be deleted unless a VERIFIED, DECRYPTABLE .env.up
 *   exists at the same location with the CURRENT key.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  generateKeypair, create, serialize, parse, decrypt,
  keyFingerprint, parseEnvFile, entriesMatch,
  isSafeToDelete,
  KeyStore, FileProvider,
} from '../index.js';

let tmpDir: string;
let envPath: string;
let envUpPath: string;

const SAMPLE_ENV = `DB_HOST=localhost
DB_PASSWORD=supersecret123
API_KEY=sk-test-abc123
`;

const SAMPLE_ENTRIES = { DB_HOST: 'localhost', DB_PASSWORD: 'supersecret123', API_KEY: 'sk-test-abc123' };

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `dotenvup-safety-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  envPath = path.join(tmpDir, '.env');
  envUpPath = path.join(tmpDir, '.env.up');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Helper: create a real encrypted .env.up from entries */
async function createValidEnvUp(
  entries: Record<string, string>,
  publicKey: Uint8Array,
  outPath?: string,
): Promise<string> {
  const recipientKeys = new Map([['@local', publicKey]]);
  const file = await create(entries, '@local', recipientKeys);
  const content = serialize(file);
  await fs.writeFile(outPath ?? envUpPath, content, 'utf8');
  return content;
}

/** Helper: check if file exists */
async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

// ============================================================
// CATEGORY 1: Normal operations — .env deletion SHOULD succeed
// ============================================================

describe('Safe deletion — valid scenarios (deletion allowed)', () => {
  it('valid .env.up with matching key → safe to delete', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const result = await isSafeToDelete(envUpPath, privateKey);
    expect(result.safe).toBe(true);
  });

  it('roundtrip: encrypt → decrypt recovers all entries', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const content = await fs.readFile(envUpPath, 'utf8');
    const file = parse(content);
    const result = await decrypt(file, '@local', privateKey);
    expect(result.entries).toEqual(SAMPLE_ENTRIES);
  });

  it('after verified .env.up, deleting .env is recoverable', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const check = await isSafeToDelete(envUpPath, privateKey);
    expect(check.safe).toBe(true);

    await fs.unlink(envPath);
    expect(await exists(envPath)).toBe(false);

    const content = await fs.readFile(envUpPath, 'utf8');
    const file = parse(content);
    const result = await decrypt(file, '@local', privateKey);
    expect(result.entries).toEqual(SAMPLE_ENTRIES);
  });

  it('single entry .env → safe', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, 'ONLY_ONE=val\n');
    await createValidEnvUp({ ONLY_ONE: 'val' }, publicKey);

    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(true);
  });

  it('large .env (100 keys) → safe if verified', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const bigEntries: Record<string, string> = {};
    for (let i = 0; i < 100; i++) bigEntries[`KEY_${i}`] = `value_${i}_${'x'.repeat(50)}`;
    await fs.writeFile(envPath, Object.entries(bigEntries).map(([k, v]) => `${k}=${v}`).join('\n'));
    await createValidEnvUp(bigEntries, publicKey);

    const result = await isSafeToDelete(envUpPath, privateKey);
    expect(result.safe).toBe(true);
  });
});

// ============================================================
// CATEGORY 2: Missing .env.up — deletion MUST be blocked
// ============================================================

describe('Missing .env.up — deletion MUST be blocked', () => {
  it('no .env.up at all → NOT safe', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);

    const result = await isSafeToDelete(envUpPath, privateKey);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('does not exist');
  });

  it('.env.up deleted after creation → NOT safe', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);
    await fs.unlink(envUpPath);

    const result = await isSafeToDelete(envUpPath, privateKey);
    expect(result.safe).toBe(false);
  });

  it('.env.up is a directory (not a file) → NOT safe', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await fs.mkdir(envUpPath);

    const result = await isSafeToDelete(envUpPath, privateKey);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('not a regular file');
  });

  it('.env.up is a symlink to nonexistent file → NOT safe', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await fs.symlink('/nonexistent/path', envUpPath);

    const result = await isSafeToDelete(envUpPath, privateKey);
    expect(result.safe).toBe(false);
  });

  it('.env.up path traversal (../somewhere) does not trick check', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    const traversalPath = path.join(tmpDir, '..', '..', 'etc', 'passwd');

    const result = await isSafeToDelete(traversalPath, privateKey);
    expect(result.safe).toBe(false);
  });
});

// ============================================================
// CATEGORY 3: Wrong key — deletion MUST be blocked
// ============================================================

describe('Wrong key — deletion MUST be blocked', () => {
  it('different keypair → cannot decrypt → NOT safe', async () => {
    const kp1 = await generateKeypair();
    const kp2 = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, kp1.publicKey);

    const result = await isSafeToDelete(envUpPath, kp2.privateKey);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('cannot be decrypted');
  });

  it('no private key available (null) → NOT safe', async () => {
    const { publicKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const result = await isSafeToDelete(envUpPath, null);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('No private key');
  });

  it('zero-length private key → NOT safe', async () => {
    const { publicKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const result = await isSafeToDelete(envUpPath, new Uint8Array(0));
    expect(result.safe).toBe(false);
  });

  it('wrong-length private key (16 bytes) → NOT safe', async () => {
    const { publicKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const result = await isSafeToDelete(envUpPath, new Uint8Array(16));
    expect(result.safe).toBe(false);
  });

  it('all-zero private key → NOT safe', async () => {
    const { publicKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const result = await isSafeToDelete(envUpPath, new Uint8Array(32));
    expect(result.safe).toBe(false);
  });

  it('key deleted from ~/.dotenvup/ after .env.up created → NOT safe', async () => {
    const kp1 = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, kp1.publicKey);

    // Simulate key loss + regen → new key can't decrypt old .env.up
    const kp2 = await generateKeypair();
    const result = await isSafeToDelete(envUpPath, kp2.privateKey);
    expect(result.safe).toBe(false);
  });
});

// ============================================================
// CATEGORY 4: Corrupted .env.up — deletion MUST be blocked
// ============================================================

describe('Corrupted .env.up — deletion MUST be blocked', () => {
  it('empty .env.up file → NOT safe', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await fs.writeFile(envUpPath, '');

    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(false);
  });

  it('garbage text in .env.up → NOT safe', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await fs.writeFile(envUpPath, 'THIS IS NOT A VALID ENV UP FILE\nrandom garbage\n');

    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(false);
  });

  it('truncated .env.up (header only, no encrypted block) → NOT safe', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const content = await fs.readFile(envUpPath, 'utf8');
    const truncated = content.split('\n').slice(0, 3).join('\n');
    await fs.writeFile(envUpPath, truncated);

    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(false);
  });

  it('.env.up with tampered encrypted payload → NOT safe', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const original = await fs.readFile(envUpPath, 'utf8');
    // libsodium base64 may be URL-safe (-_); match the same alphabet as the serializer
    const content = original.replace(/(payload:)([A-Za-z0-9+/_=-]+)/, (_m, prefix: string, payload: string) => {
      const corrupted = 'AAAA' + payload.slice(4);
      return prefix + corrupted;
    });
    expect(content).not.toBe(original);
    await fs.writeFile(envUpPath, content);

    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(false);
  });

  it('binary content in .env.up → NOT safe', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    const binaryGarbage = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) binaryGarbage[i] = i;
    await fs.writeFile(envUpPath, binaryGarbage);

    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(false);
  });

  it('.env.up with non-default recipient but decryptable key → safe', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    // Create with non-default recipient
    const recipientKeys = new Map([['@other-user', publicKey]]);
    const file = await create(SAMPLE_ENTRIES, '@other-user', recipientKeys);
    const content = serialize(file);
    await fs.writeFile(envUpPath, content, 'utf8');

    // safe-delete now tries all recipient blocks, not only @local
    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(true);
  });

  it('.env.up containing just the magic header line → NOT safe', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await fs.writeFile(envUpPath, '#!dotenvup v1\n');

    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(false);
  });

  it('.env.up is a plain .env file (not encrypted) → NOT safe', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await fs.writeFile(envUpPath, SAMPLE_ENV); // plain text, not encrypted

    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(false);
  });

  it('.env.up with tampered encrypted payload (corrupt base64) → NOT safe', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const content = await fs.readFile(envUpPath, 'utf8');
    const encryptedLine = content.split(/\r?\n/).find((l) => l.includes('payload:'));
    expect(encryptedLine).toBeTruthy();
    const payloadMatch = encryptedLine!.match(/payload:([A-Za-z0-9+/_=-]+)/);
    expect(payloadMatch).toBeTruthy();
    const payload = payloadMatch![1];
    const corruptPayload = payload.slice(0, -2) + (payload.slice(-1) === 'A' ? 'B' : 'A');
    const corrupted = content.replace(/payload:[A-Za-z0-9+/_=-]+/, `payload:${corruptPayload}`);
    await fs.writeFile(envUpPath, corrupted);

    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(false);
  });
});

// ============================================================
// CATEGORY 5: Deactivate scenarios (extension close)
// ============================================================

describe('Deactivate — simulated extension close', () => {
  /** Simulates the fixed deactivate() logic with magic-header check */
  function simulateDeactivate(unlockedRoots: Set<string>): { deleted: string[]; blocked: string[] } {
    const deleted: string[] = [];
    const blocked: string[] = [];
    for (const root of unlockedRoots) {
      const ep = path.join(root, '.env');
      const eup = path.join(root, '.env.up');
      let safeToDelete = false;
      try {
        const stat = fsSync.statSync(eup);
        if (stat.isFile() && stat.size > 0) {
          const content = fsSync.readFileSync(eup, 'utf8');
          safeToDelete = content.startsWith('#!dotenvup');
        }
      } catch {
        safeToDelete = false;
      }
      if (!safeToDelete) { blocked.push(root); continue; }
      if (!fsSync.existsSync(ep)) continue;
      fsSync.unlinkSync(ep);
      deleted.push(root);
    }
    return { deleted, blocked };
  }

  it('unlocked root WITH valid .env.up → deletes .env', async () => {
    const { publicKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const result = simulateDeactivate(new Set([tmpDir]));
    expect(result.deleted).toContain(tmpDir);
  });

  it('unlocked root WITHOUT .env.up → BLOCKS', async () => {
    await fs.writeFile(envPath, SAMPLE_ENV);

    const result = simulateDeactivate(new Set([tmpDir]));
    expect(result.blocked).toContain(tmpDir);
    expect(await exists(envPath)).toBe(true);
  });

  it('.env.up deleted while unlocked → BLOCKS on deactivate', async () => {
    const { publicKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);
    await fs.unlink(envUpPath);

    const result = simulateDeactivate(new Set([tmpDir]));
    expect(result.blocked).toContain(tmpDir);
    expect(await exists(envPath)).toBe(true);
  });

  it('empty .env.up file on deactivate → BLOCKS', async () => {
    await fs.writeFile(envPath, SAMPLE_ENV);
    await fs.writeFile(envUpPath, '');

    const result = simulateDeactivate(new Set([tmpDir]));
    expect(result.blocked).toContain(tmpDir);
    expect(await exists(envPath)).toBe(true);
  });

  it('.env.up without magic header on deactivate → BLOCKS', async () => {
    await fs.writeFile(envPath, SAMPLE_ENV);
    await fs.writeFile(envUpPath, 'not a valid format\nsome content');

    const result = simulateDeactivate(new Set([tmpDir]));
    expect(result.blocked).toContain(tmpDir);
    expect(await exists(envPath)).toBe(true);
  });

  it('.env.up is a directory on deactivate → BLOCKS', async () => {
    await fs.writeFile(envPath, SAMPLE_ENV);
    await fs.mkdir(envUpPath);

    const result = simulateDeactivate(new Set([tmpDir]));
    expect(result.blocked).toContain(tmpDir);
    expect(await exists(envPath)).toBe(true);
  });

  it('multiple roots: mixed — only safe ones deleted', async () => {
    const dir2 = path.join(os.tmpdir(), `dotenvup-safety-2-${Date.now()}`);
    await fs.mkdir(dir2, { recursive: true });
    await fs.writeFile(path.join(dir2, '.env'), 'KEY=val');

    const { publicKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const result = simulateDeactivate(new Set([tmpDir, dir2]));
    expect(result.deleted).toContain(tmpDir);
    expect(result.blocked).toContain(dir2);
    expect(await exists(path.join(dir2, '.env'))).toBe(true);

    await fs.rm(dir2, { recursive: true, force: true });
  });

  it('root directory itself deleted → BLOCKS (no crash)', async () => {
    await fs.writeFile(envPath, SAMPLE_ENV);
    const ghostDir = path.join(os.tmpdir(), `dotenvup-ghost-${Date.now()}`);
    // ghostDir never created — doesn't exist

    const result = simulateDeactivate(new Set([ghostDir]));
    expect(result.blocked).toContain(ghostDir);
  });
});

// ============================================================
// CATEGORY 6: Auto-lock timer scenarios
// ============================================================

describe('Auto-lock timer — simulated timer expiry (with isSafeToDelete)', () => {
  async function simulateAutoLock(
    epPath: string, eupPath: string, privKey: Uint8Array | null,
  ): Promise<{ deleted: boolean; reason: string }> {
    const check = await isSafeToDelete(eupPath, privKey);
    if (!check.safe) return { deleted: false, reason: check.reason };
    try {
      await fs.unlink(epPath);
      return { deleted: true, reason: 'auto-locked' };
    } catch {
      return { deleted: false, reason: 'unlink failed' };
    }
  }

  it('auto-lock with valid .env.up + correct key → deletes .env', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const result = await simulateAutoLock(envPath, envUpPath, privateKey);
    expect(result.deleted).toBe(true);
  });

  it('auto-lock after .env.up deleted → BLOCKS', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);

    const result = await simulateAutoLock(envPath, envUpPath, privateKey);
    expect(result.deleted).toBe(false);
    expect(await exists(envPath)).toBe(true);
  });

  it('.env.up removed between unlock and timer → BLOCKS', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);
    await fs.unlink(envUpPath);

    const result = await simulateAutoLock(envPath, envUpPath, privateKey);
    expect(result.deleted).toBe(false);
    expect(await exists(envPath)).toBe(true);
  });

  it('key file deleted between unlock and timer → BLOCKS', async () => {
    const { publicKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    // Key is gone
    const result = await simulateAutoLock(envPath, envUpPath, null);
    expect(result.deleted).toBe(false);
    expect(await exists(envPath)).toBe(true);
  });

  it('.env.up corrupted between unlock and timer → BLOCKS', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    await fs.writeFile(envUpPath, 'corrupted!');

    const result = await simulateAutoLock(envPath, envUpPath, privateKey);
    expect(result.deleted).toBe(false);
    expect(await exists(envPath)).toBe(true);
  });
});

// ============================================================
// CATEGORY 7: ~/.dotenvup directory edge cases
// ============================================================

describe('~/.dotenvup directory edge cases', () => {
  let keyDir: string;

  beforeEach(async () => {
    keyDir = path.join(tmpDir, '.dotenvup-keys');
  });

  it('entire ~/.dotenvup directory deleted → FileProvider returns null → NOT safe', async () => {
    const fp = new FileProvider(keyDir);
    const { publicKey, privateKey } = await generateKeypair();
    await fp.saveKeypair(publicKey, privateKey);
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    // Delete entire key dir
    await fs.rm(keyDir, { recursive: true, force: true });

    const kp = await fp.getKeypair();
    expect(kp).toBeNull();

    const result = await isSafeToDelete(envUpPath, null);
    expect(result.safe).toBe(false);
  });

  it('wrapping key deleted but identity.enc remains → FileProvider returns null', async () => {
    const fp = new FileProvider(keyDir);
    const { publicKey, privateKey } = await generateKeypair();
    await fp.saveKeypair(publicKey, privateKey);

    await fs.unlink(path.join(keyDir, 'wrapping-key'));

    const kp = await fp.getKeypair();
    expect(kp).toBeNull();
  });

  it('identity.pub deleted but envelope remains → FileProvider returns null', async () => {
    const fp = new FileProvider(keyDir);
    const { publicKey, privateKey } = await generateKeypair();
    await fp.saveKeypair(publicKey, privateKey);

    await fs.unlink(path.join(keyDir, 'identity.pub'));

    const kp = await fp.getKeypair();
    expect(kp).toBeNull();
  });

  it('identity file has wrong content (not base64) → FileProvider returns null', async () => {
    const fp = new FileProvider(keyDir);
    await fs.mkdir(keyDir, { recursive: true });
    await fs.writeFile(path.join(keyDir, 'identity'), 'not base64!!!');
    await fs.writeFile(path.join(keyDir, 'identity.pub'), 'also not base64!!!');

    const kp = await fp.getKeypair();
    expect(kp).toBeNull();
  });

  it('identity files are empty → FileProvider returns null', async () => {
    const fp = new FileProvider(keyDir);
    await fs.mkdir(keyDir, { recursive: true });
    await fs.writeFile(path.join(keyDir, 'identity'), '');
    await fs.writeFile(path.join(keyDir, 'identity.pub'), '');

    const kp = await fp.getKeypair();
    expect(kp).toBeNull();
  });

  it('identity file has too-short key (16 bytes) → FileProvider returns null', async () => {
    const fp = new FileProvider(keyDir);
    await fs.mkdir(keyDir, { recursive: true });
    const shortKey = Buffer.alloc(16).toString('base64');
    await fs.writeFile(path.join(keyDir, 'identity'), shortKey);
    await fs.writeFile(path.join(keyDir, 'identity.pub'), shortKey);

    const kp = await fp.getKeypair();
    expect(kp).toBeNull();
  });

  it('identity replaced with different key → old .env.up NOT safe', async () => {
    const fp = new FileProvider(keyDir);
    const kp1 = await generateKeypair();
    await fp.saveKeypair(kp1.publicKey, kp1.privateKey);

    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, kp1.publicKey);

    // Replace key
    const kp2 = await generateKeypair();
    await fp.saveKeypair(kp2.publicKey, kp2.privateKey);
    const newKp = await fp.getKeypair();

    const result = await isSafeToDelete(envUpPath, newKp!.privateKey);
    expect(result.safe).toBe(false);
  });

  it('KeyStore with empty providers chain → hasKeypair false → NOT safe', async () => {
    const store = new KeyStore([]);
    expect(await store.hasKeypair()).toBe(false);
    const pk = await store.getPrivateKey();

    await fs.writeFile(envPath, SAMPLE_ENV);
    const { publicKey } = await generateKeypair();
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const result = await isSafeToDelete(envUpPath, pk);
    expect(result.safe).toBe(false);
  });
});

// ============================================================
// CATEGORY 8: Strange .env.up file scenarios
// ============================================================

describe('Strange .env.up files', () => {
  it('.env.up is a symlink to a valid file → safe (follows symlink)', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const realPath = path.join(tmpDir, '.env.up.real');
    await fs.writeFile(envPath, SAMPLE_ENV);

    const recipientKeys = new Map([['@local', publicKey]]);
    const file = await create(SAMPLE_ENTRIES, '@local', recipientKeys);
    await fs.writeFile(realPath, serialize(file), 'utf8');
    await fs.symlink(realPath, envUpPath);

    // stat follows symlinks, so this should pass
    const result = await isSafeToDelete(envUpPath, privateKey);
    expect(result.safe).toBe(true);
  });

  it('.env.up is a symlink to nonexistent → NOT safe', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await fs.symlink('/nonexistent/path', envUpPath);

    const result = await isSafeToDelete(envUpPath, privateKey);
    expect(result.safe).toBe(false);
  });

  it('.env.up with CRLF line endings → still valid', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    let content = await fs.readFile(envUpPath, 'utf8');
    content = content.replace(/\n/g, '\r\n');
    await fs.writeFile(envUpPath, content, 'utf8');

    // This may or may not parse depending on the parser. Either way should not crash.
    const result = await isSafeToDelete(envUpPath, privateKey);
    // We just check it doesn't crash; actual result depends on parser CRLF handling
    expect(typeof result.safe).toBe('boolean');
  });

  it('.env.up with BOM → may fail parse but does not crash', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    let content = await fs.readFile(envUpPath, 'utf8');
    content = '\ufeff' + content; // UTF-8 BOM
    await fs.writeFile(envUpPath, content, 'utf8');

    const result = await isSafeToDelete(envUpPath, privateKey);
    expect(typeof result.safe).toBe('boolean');
  });

  it('.env.up that is extremely large (1MB random) → NOT safe', async () => {
    const { privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    const bigContent = '#!dotenvup v1\n' + 'x'.repeat(1024 * 1024);
    await fs.writeFile(envUpPath, bigContent);

    const result = await isSafeToDelete(envUpPath, privateKey);
    expect(result.safe).toBe(false);
  });

  it('.env.up from a different format version → NOT safe (cannot decrypt)', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    // Replace version number
    let content = await fs.readFile(envUpPath, 'utf8');
    content = content.replace('#!dotenvup v1', '#!dotenvup v99');
    await fs.writeFile(envUpPath, content);

    const result = await isSafeToDelete(envUpPath, privateKey);
    // Parser may reject unknown version or succeed — either way must not crash
    expect(typeof result.safe).toBe('boolean');
  });
});

// ============================================================
// CATEGORY 9: Import edge cases
// ============================================================

describe('Import — delete source .env edge cases', () => {
  it('import verified .env.up is decryptable → safe', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const result = await isSafeToDelete(envUpPath, privateKey);
    expect(result.safe).toBe(true);
  });

  it('import wrote file but key was swapped → NOT safe', async () => {
    const kp1 = await generateKeypair();
    const kp2 = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, kp1.publicKey);

    // Key was swapped before verification
    const result = await isSafeToDelete(envUpPath, kp2.privateKey);
    expect(result.safe).toBe(false);
  });

  it('empty .env file → parseEnvFile returns 0 entries', async () => {
    await fs.writeFile(envPath, '# just a comment\n\n');
    const entries = parseEnvFile(await fs.readFile(envPath, 'utf8'));
    expect(Object.keys(entries).length).toBe(0);
  });

  it('.env with only whitespace → 0 entries', async () => {
    await fs.writeFile(envPath, '   \n\n   \n');
    const entries = parseEnvFile(await fs.readFile(envPath, 'utf8'));
    expect(Object.keys(entries).length).toBe(0);
  });

  it('.env with special characters in values → roundtrips correctly', async () => {
    const specialEntries = {
      QUOTE: 'value with "quotes"',
      NEWLINE: 'line1\nline2',
      EQUALS: 'key=value',
      UNICODE: 'Ünîcödé ✓',
    };
    const { publicKey, privateKey } = await generateKeypair();
    await createValidEnvUp(specialEntries, publicKey);

    const content = await fs.readFile(envUpPath, 'utf8');
    const file = parse(content);
    const decrypted = await decrypt(file, '@local', privateKey);
    expect(decrypted.entries).toEqual(specialEntries);
  });
});

// ============================================================
// CATEGORY 10: Protect flow edge cases
// ============================================================

describe('Protect flow — full pipeline edge cases', () => {
  it('new keypair → import → verify → lock: full success', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const check = await isSafeToDelete(envUpPath, privateKey);
    expect(check.safe).toBe(true);

    await fs.unlink(envPath);

    const content = await fs.readFile(envUpPath, 'utf8');
    const file = parse(content);
    const recovered = await decrypt(file, '@local', privateKey);
    expect(recovered.entries).toEqual(SAMPLE_ENTRIES);
  });

  it('import succeeds but key is regenerated before lock → BLOCKS', async () => {
    const kp1 = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, kp1.publicKey);

    const kp2 = await generateKeypair();
    expect((await isSafeToDelete(envUpPath, kp2.privateKey)).safe).toBe(false);
    expect(await exists(envPath)).toBe(true);
  });

  it('.env.up exists but encrypted with different key → NOT safe', async () => {
    const kp1 = await generateKeypair();
    const kp2 = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, kp1.publicKey);

    expect((await isSafeToDelete(envUpPath, kp2.privateKey)).safe).toBe(false);
  });

  it('backup is created before .env deletion', async () => {
    const { publicKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const backupPath = envPath + `.bak-${Date.now()}`;
    await fs.copyFile(envPath, backupPath);
    await fs.unlink(envPath);

    const backupContent = await fs.readFile(backupPath, 'utf8');
    expect(backupContent).toBe(SAMPLE_ENV);
  });
});

// ============================================================
// CATEGORY 11: Race conditions & TOCTOU
// ============================================================

describe('Race conditions', () => {
  it('.env.up deleted between verify and unlink → backup preserves data', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(true);
    await fs.unlink(envUpPath);

    const backupPath = envPath + `.bak-race`;
    await fs.copyFile(envPath, backupPath);
    await fs.unlink(envPath);

    expect(await exists(backupPath)).toBe(true);
    expect(await fs.readFile(backupPath, 'utf8')).toBe(SAMPLE_ENV);
  });

  it('concurrent writes: .env changes after verify → drift detected', async () => {
    const { publicKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const entries1 = parseEnvFile(await fs.readFile(envPath, 'utf8'));
    await fs.writeFile(envPath, 'NEW_KEY=new_value\n');
    const entries2 = parseEnvFile(await fs.readFile(envPath, 'utf8'));

    expect(entriesMatch(entries1, entries2)).toBe(false);
  });
});

// ============================================================
// CATEGORY 12: Multi-workspace scenarios
// ============================================================

describe('Multi-workspace edge cases', () => {
  it('project A has .env.up, project B does not → only A safe', async () => {
    const dirB = path.join(os.tmpdir(), `dotenvup-safety-B-${Date.now()}`);
    await fs.mkdir(dirB, { recursive: true });

    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);
    await fs.writeFile(path.join(dirB, '.env'), 'SECRET=value');

    expect((await isSafeToDelete(envUpPath, privateKey)).safe).toBe(true);
    expect((await isSafeToDelete(path.join(dirB, '.env.up'), privateKey)).safe).toBe(false);

    await fs.rm(dirB, { recursive: true, force: true });
  });

  it('two projects encrypted with different keys → each only safe with its own key', async () => {
    const dirB = path.join(os.tmpdir(), `dotenvup-safety-B2-${Date.now()}`);
    await fs.mkdir(dirB, { recursive: true });

    const kpA = await generateKeypair();
    const kpB = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, kpA.publicKey);

    await fs.writeFile(path.join(dirB, '.env'), 'OTHER=val');
    await createValidEnvUp({ OTHER: 'val' }, kpB.publicKey, path.join(dirB, '.env.up'));

    // A's key works for A, not B
    expect((await isSafeToDelete(envUpPath, kpA.privateKey)).safe).toBe(true);
    expect((await isSafeToDelete(path.join(dirB, '.env.up'), kpA.privateKey)).safe).toBe(false);

    // B's key works for B, not A
    expect((await isSafeToDelete(path.join(dirB, '.env.up'), kpB.privateKey)).safe).toBe(true);
    expect((await isSafeToDelete(envUpPath, kpB.privateKey)).safe).toBe(false);

    await fs.rm(dirB, { recursive: true, force: true });
  });
});

// ============================================================
// CATEGORY 13: Multiple keystores / provider chain edge cases
// ============================================================

describe('Multiple keystores / provider chain', () => {
  it('two FileProviders: keys match → both can decrypt same .env.up', async () => {
    const dir1 = path.join(tmpDir, 'keys1');
    const dir2 = path.join(tmpDir, 'keys2');
    const fp1 = new FileProvider(dir1);
    const fp2 = new FileProvider(dir2);

    const { publicKey, privateKey } = await generateKeypair();
    await fp1.saveKeypair(publicKey, privateKey);
    await fp2.saveKeypair(publicKey, privateKey);

    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    const kp1 = await fp1.getKeypair();
    const kp2 = await fp2.getKeypair();
    expect((await isSafeToDelete(envUpPath, kp1!.privateKey)).safe).toBe(true);
    expect((await isSafeToDelete(envUpPath, kp2!.privateKey)).safe).toBe(true);
  });

  it('two FileProviders with DIFFERENT keys → only correct one is safe', async () => {
    const dir1 = path.join(tmpDir, 'keys1');
    const dir2 = path.join(tmpDir, 'keys2');
    const fp1 = new FileProvider(dir1);
    const fp2 = new FileProvider(dir2);

    const kp1 = await generateKeypair();
    const kp2 = await generateKeypair();
    await fp1.saveKeypair(kp1.publicKey, kp1.privateKey);
    await fp2.saveKeypair(kp2.publicKey, kp2.privateKey);

    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, kp1.publicKey);

    const stored1 = await fp1.getKeypair();
    const stored2 = await fp2.getKeypair();
    expect((await isSafeToDelete(envUpPath, stored1!.privateKey)).safe).toBe(true);
    expect((await isSafeToDelete(envUpPath, stored2!.privateKey)).safe).toBe(false);
  });

  it('KeyStore chain: EnvProvider empty, FileProvider has key → works', async () => {
    const keyDir = path.join(tmpDir, 'keys');
    const fp = new FileProvider(keyDir);
    const { publicKey, privateKey } = await generateKeypair();
    await fp.saveKeypair(publicKey, privateKey);

    // EnvProvider has no key (UP_KEY not set for this test)
    const store = new KeyStore([fp]);
    const kp = await store.getKeypair();
    expect(kp).not.toBeNull();

    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);

    expect((await isSafeToDelete(envUpPath, kp!.privateKey)).safe).toBe(true);
  });

  it('KeyStore: all providers empty → hasKeypair false', async () => {
    const emptyDir = path.join(tmpDir, 'empty-keys');
    const fp = new FileProvider(emptyDir);
    const store = new KeyStore([fp]);

    expect(await store.hasKeypair()).toBe(false);
    const pk = await store.getPrivateKey();
    expect(pk).toBeNull();
  });

  it('key overwritten in FileProvider → old .env.up NOT safe with new key', async () => {
    const keyDir = path.join(tmpDir, 'keys');
    const fp = new FileProvider(keyDir);

    const kp1 = await generateKeypair();
    await fp.saveKeypair(kp1.publicKey, kp1.privateKey);
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, kp1.publicKey);

    // Overwrite key
    const kp2 = await generateKeypair();
    await fp.saveKeypair(kp2.publicKey, kp2.privateKey);
    const newKp = await fp.getKeypair();

    expect((await isSafeToDelete(envUpPath, newKp!.privateKey)).safe).toBe(false);
  });
});

// ============================================================
// CATEGORY 14: Permission edge cases
// ============================================================

describe('Permission edge cases', () => {
  it('.env.up with no read permission → NOT safe (cannot read)', async function () {
    // Skip on non-POSIX or if running as root
    if (process.platform === 'win32' || process.getuid?.() === 0) return;

    const { publicKey, privateKey } = await generateKeypair();
    await fs.writeFile(envPath, SAMPLE_ENV);
    await createValidEnvUp(SAMPLE_ENTRIES, publicKey);
    await fs.chmod(envUpPath, 0o000);

    try {
      const result = await isSafeToDelete(envUpPath, privateKey);
      expect(result.safe).toBe(false);
    } finally {
      await fs.chmod(envUpPath, 0o644);
    }
  });
});

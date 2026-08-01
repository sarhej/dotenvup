import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  saveKeypairEnvelope,
  loadKeypairEnvelope,
  detectKeyStorageMode,
  migrateFileEnvelopeToKeychain,
  readIdentityEnvelope,
  writeFileWrappingKey,
  recoveryBundlePath,
  exportKeyBundle,
  setKeychainHelperForTests,
  AuthCancelledError,
  NonInteractiveKeychainError,
  type KeychainHelperApi,
  generateKeypair,
  keyFingerprint,
  WRAPPING_KEY_FILE,
} from '../index.js';

function mockHelper(store: Map<string, Uint8Array>): KeychainHelperApi {
  return {
    async probe() {
      return {
        version: 'test',
        service: 'com.dotenvup.wrapping-key',
        biometryAvailable: true,
        ownerAuthAvailable: true,
        biometryType: 'touchID',
      };
    },
    async set(account, key) {
      store.set(account, new Uint8Array(key));
    },
    async get(account) {
      const k = store.get(account);
      if (!k) throw new Error('not found');
      return new Uint8Array(k);
    },
    async has(account) {
      return store.has(account);
    },
    async delete(account) {
      store.delete(account);
    },
  };
}

describe('keychain envelope (mocked helper)', () => {
  let tmpDir: string;
  const store = new Map<string, Uint8Array>();
  let prevNoSession: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotenvup-kc-'));
    store.clear();
    setKeychainHelperForTests(mockHelper(store));
    prevNoSession = process.env.DOTENVUP_NO_SESSION;
    process.env.DOTENVUP_NO_SESSION = '1';
  });

  afterEach(() => {
    setKeychainHelperForTests(undefined);
    if (prevNoSession === undefined) delete process.env.DOTENVUP_NO_SESSION;
    else process.env.DOTENVUP_NO_SESSION = prevNoSession;
  });

  it('migrates file envelope to keychain and decrypts', async () => {
    const kp = await generateKeypair();
    await saveKeypairEnvelope(tmpDir, kp.publicKey, kp.privateKey);
    expect(await detectKeyStorageMode(tmpDir)).toBe('file-envelope');

    const keyId = await keyFingerprint(kp.publicKey);
    const bundle = await exportKeyBundle(kp, 'alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel');
    const bundlePath = recoveryBundlePath(tmpDir, keyId);
    await fs.mkdir(path.dirname(bundlePath), { recursive: true, mode: 0o700 });
    await fs.writeFile(bundlePath, JSON.stringify(bundle), { mode: 0o600 });

    const result = await migrateFileEnvelopeToKeychain(tmpDir);
    expect(result.keyId).toBe(keyId);
    expect(await detectKeyStorageMode(tmpDir)).toBe('keychain');

    const env = await readIdentityEnvelope(tmpDir);
    expect(env?.wrap.source).toBe('keychain');
    expect(env?.wrap.account).toBe(keyId);

    await expect(fs.access(path.join(tmpDir, WRAPPING_KEY_FILE))).rejects.toThrow();

    const loaded = await loadKeypairEnvelope(tmpDir);
    expect(loaded).not.toBeNull();
    expect(Buffer.from(loaded!.privateKey).equals(Buffer.from(kp.privateKey))).toBe(true);
  });

  it('falls back to wrapping-key file when helper missing mid-migrate', async () => {
    const kp = await generateKeypair();
    await saveKeypairEnvelope(tmpDir, kp.publicKey, kp.privateKey);
    const keyId = await keyFingerprint(kp.publicKey);
    const bundle = await exportKeyBundle(kp, 'alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel');
    const bundlePath = recoveryBundlePath(tmpDir, keyId);
    await fs.mkdir(path.dirname(bundlePath), { recursive: true, mode: 0o700 });
    await fs.writeFile(bundlePath, JSON.stringify(bundle), { mode: 0o600 });

    await migrateFileEnvelopeToKeychain(tmpDir);

    // Simulate rollback file still present: rewrite wrap as keychain but restore file
    // Actually after migrate file is gone — put key back and break helper
    const wrappingKey = store.get(keyId)!;
    await writeFileWrappingKey(tmpDir, wrappingKey);
    setKeychainHelperForTests(null);

    const loaded = await loadKeypairEnvelope(tmpDir);
    expect(loaded).not.toBeNull();
    expect(Buffer.from(loaded!.privateKey).equals(Buffer.from(kp.privateKey))).toBe(true);
  });

  it('rethrows AuthCancelledError from helper get', async () => {
    const kp = await generateKeypair();
    await saveKeypairEnvelope(tmpDir, kp.publicKey, kp.privateKey);
    const keyId = await keyFingerprint(kp.publicKey);
    const bundle = await exportKeyBundle(kp, 'alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel');
    const bundlePath = recoveryBundlePath(tmpDir, keyId);
    await fs.mkdir(path.dirname(bundlePath), { recursive: true, mode: 0o700 });
    await fs.writeFile(bundlePath, JSON.stringify(bundle), { mode: 0o600 });
    await migrateFileEnvelopeToKeychain(tmpDir);

    setKeychainHelperForTests({
      ...mockHelper(store),
      async get() {
        throw new AuthCancelledError();
      },
    });

    await expect(loadKeypairEnvelope(tmpDir)).rejects.toBeInstanceOf(AuthCancelledError);
  });

  it('refuses Keychain get when DOTENVUP_NO_PROMPT=1', async () => {
    const kp = await generateKeypair();
    await saveKeypairEnvelope(tmpDir, kp.publicKey, kp.privateKey);
    const keyId = await keyFingerprint(kp.publicKey);
    const bundle = await exportKeyBundle(kp, 'alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel');
    const bundlePath = recoveryBundlePath(tmpDir, keyId);
    await fs.mkdir(path.dirname(bundlePath), { recursive: true, mode: 0o700 });
    await fs.writeFile(bundlePath, JSON.stringify(bundle), { mode: 0o600 });
    await migrateFileEnvelopeToKeychain(tmpDir);

    const prev = process.env.DOTENVUP_NO_PROMPT;
    process.env.DOTENVUP_NO_PROMPT = '1';
    try {
      await expect(loadKeypairEnvelope(tmpDir)).rejects.toBeInstanceOf(NonInteractiveKeychainError);
    } finally {
      if (prev === undefined) delete process.env.DOTENVUP_NO_PROMPT;
      else process.env.DOTENVUP_NO_PROMPT = prev;
    }
  });

  it('keeps file envelope working when helper unavailable', async () => {
    setKeychainHelperForTests(null);
    const kp = await generateKeypair();
    await saveKeypairEnvelope(tmpDir, kp.publicKey, kp.privateKey);
    expect(await detectKeyStorageMode(tmpDir)).toBe('file-envelope');
    const loaded = await loadKeypairEnvelope(tmpDir);
    expect(loaded).not.toBeNull();
  });
});

/**
 * Keychain envelope + session agent integration (mocked helper, real agent).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  saveKeypairEnvelope,
  loadKeypairEnvelope,
  migrateFileEnvelopeToKeychain,
  recoveryBundlePath,
  exportKeyBundle,
  setKeychainHelperForTests,
  NonInteractiveKeychainError,
  AuthCancelledError,
  sessionStop,
  sessionStatus,
  sessionPut,
  type KeychainHelperApi,
  generateKeypair,
  keyFingerprint,
  WRAPPING_KEY_FILE,
  readIdentityEnvelope,
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

async function setupEnvelopeWithRecovery(tmpDir: string, store: Map<string, Uint8Array>) {
  const kp = await generateKeypair();
  await saveKeypairEnvelope(tmpDir, kp.publicKey, kp.privateKey);
  const keyId = await keyFingerprint(kp.publicKey);
  const bundle = await exportKeyBundle(kp, 'alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel');
  const bundlePath = recoveryBundlePath(tmpDir, keyId);
  await fs.mkdir(path.dirname(bundlePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(bundlePath, JSON.stringify(bundle), { mode: 0o600 });
  await migrateFileEnvelopeToKeychain(tmpDir);
  return { kp, keyId };
}

describe('keychain + session integration', () => {
  let tmpDir: string;
  let sessDir: string;
  const store = new Map<string, Uint8Array>();
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotenvup-kc-sess-'));
    sessDir = fssync.mkdtempSync(path.join(os.tmpdir(), 'dotenvup-kc-sess-agent-'));
    store.clear();
    setKeychainHelperForTests(mockHelper(store));
    for (const k of [
      'DOTENVUP_SESSION_SOCK',
      'DOTENVUP_SESSION_COOKIE',
      'DOTENVUP_NO_PRESENCE',
      'DOTENVUP_NO_SESSION',
      'DOTENVUP_NO_PROMPT',
      'DOTENVUP_SESSION_IDLE_TTL',
      'DOTENVUP_SESSION_ABSOLUTE_TTL',
    ]) {
      saved[k] = process.env[k];
    }
    process.env.DOTENVUP_SESSION_SOCK = path.join(sessDir, 'agent.sock');
    process.env.DOTENVUP_SESSION_COOKIE = path.join(sessDir, 'agent.cookie');
    process.env.DOTENVUP_NO_PRESENCE = '1';
    process.env.DOTENVUP_SESSION_IDLE_TTL = '30s';
    process.env.DOTENVUP_SESSION_ABSOLUTE_TTL = '60s';
    delete process.env.DOTENVUP_NO_SESSION;
    delete process.env.DOTENVUP_NO_PROMPT;
  });

  afterEach(async () => {
    await sessionStop().catch(() => undefined);
    setKeychainHelperForTests(undefined);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    try {
      fssync.rmSync(sessDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('warm session allows DOTENVUP_NO_PROMPT load; cold refuses', async () => {
    const { keyId } = await setupEnvelopeWithRecovery(tmpDir, store);

    // Interactive (mock) load seeds the session agent.
    const warmLoad = await loadKeypairEnvelope(tmpDir);
    expect(warmLoad).not.toBeNull();
    const st = await sessionStatus();
    expect(st.active).toBe(true);
    expect(st.keyId).toBe(keyId);

    process.env.DOTENVUP_NO_PROMPT = '1';
    // Helper get would throw; warm session must win.
    setKeychainHelperForTests({
      ...mockHelper(store),
      async get() {
        throw new NonInteractiveKeychainError();
      },
    });
    const fromSession = await loadKeypairEnvelope(tmpDir);
    expect(fromSession).not.toBeNull();

    await sessionStop();
    await expect(loadKeypairEnvelope(tmpDir)).rejects.toBeInstanceOf(NonInteractiveKeychainError);
  });

  it('wrong session keyId does not decrypt; falls through to helper', async () => {
    const { kp, keyId } = await setupEnvelopeWithRecovery(tmpDir, store);
    const other = await generateKeypair();
    const otherId = await keyFingerprint(other.publicKey);
    expect(await sessionPut(otherId, other)).toBe(true);

    const loaded = await loadKeypairEnvelope(tmpDir);
    expect(loaded).not.toBeNull();
    expect(Buffer.from(loaded!.privateKey).equals(Buffer.from(kp.privateKey))).toBe(true);
    // After helper unwrap, session should hold the correct key.
    const st = await sessionStatus();
    expect(st.keyId).toBe(keyId);
  });

  it('migrate refuses without recovery bundle', async () => {
    const kp = await generateKeypair();
    await saveKeypairEnvelope(tmpDir, kp.publicKey, kp.privateKey);
    await expect(migrateFileEnvelopeToKeychain(tmpDir)).rejects.toThrow(/Recovery bundle required/);
  });

  it('migrate rolls back Keychain item when get fails after set', async () => {
    const kp = await generateKeypair();
    await saveKeypairEnvelope(tmpDir, kp.publicKey, kp.privateKey);
    const keyId = await keyFingerprint(kp.publicKey);
    const bundle = await exportKeyBundle(kp, 'alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel');
    const bundlePath = recoveryBundlePath(tmpDir, keyId);
    await fs.mkdir(path.dirname(bundlePath), { recursive: true, mode: 0o700 });
    await fs.writeFile(bundlePath, JSON.stringify(bundle), { mode: 0o600 });

    let getCalls = 0;
    setKeychainHelperForTests({
      ...mockHelper(store),
      async get(account) {
        getCalls++;
        if (getCalls === 1) {
          // Round-trip verify during migrate
          throw new AuthCancelledError();
        }
        return mockHelper(store).get(account);
      },
    });

    await expect(migrateFileEnvelopeToKeychain(tmpDir)).rejects.toBeInstanceOf(AuthCancelledError);
    expect(store.has(keyId)).toBe(false);
    const env = await readIdentityEnvelope(tmpDir);
    expect(env?.wrap.source).toBe('file');
    await expect(fs.access(path.join(tmpDir, WRAPPING_KEY_FILE))).resolves.toBeUndefined();
  });
});

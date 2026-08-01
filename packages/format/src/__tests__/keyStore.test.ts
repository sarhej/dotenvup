import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { KeyStore } from '../keyStore.js';
import { FileProvider } from '../providers/fileProvider.js';
import { EnvProvider } from '../providers/envProvider.js';
import { generateKeypair } from '../crypto.js';
import type { KeyProvider, Keypair } from '../keyProvider.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `dotenvup-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('FileProvider', () => {
  it('returns null when no key files exist', async () => {
    const fp = new FileProvider(tmpDir);
    const kp = await fp.getKeypair();
    expect(kp).toBeNull();
  });

  it('saves and reads a keypair', async () => {
    const fp = new FileProvider(tmpDir);
    const { publicKey, privateKey } = await generateKeypair();

    await fp.saveKeypair(publicKey, privateKey);

    const kp = await fp.getKeypair();
    expect(kp).not.toBeNull();
    expect(Buffer.from(kp!.publicKey)).toEqual(Buffer.from(publicKey));
    expect(Buffer.from(kp!.privateKey)).toEqual(Buffer.from(privateKey));
  });

  it('writes envelope and wrapping key with correct permissions', async () => {
    const fp = new FileProvider(tmpDir);
    const { publicKey, privateKey } = await generateKeypair();
    await fp.saveKeypair(publicKey, privateKey);

    const encStat = await fs.stat(path.join(tmpDir, 'identity.enc'));
    const wrapStat = await fs.stat(path.join(tmpDir, 'wrapping-key'));
    // 0o600 = owner read+write
    expect(encStat.mode & 0o777).toBe(0o600);
    expect(wrapStat.mode & 0o777).toBe(0o600);
    // Plaintext identity must not remain after envelope save
    await expect(fs.access(path.join(tmpDir, 'identity'))).rejects.toThrow();
  });

  it('creates nested directory if needed', async () => {
    const nestedDir = path.join(tmpDir, 'deep', 'nested');
    const fp = new FileProvider(nestedDir);
    const { publicKey, privateKey } = await generateKeypair();
    await fp.saveKeypair(publicKey, privateKey);

    const kp = await fp.getKeypair();
    expect(kp).not.toBeNull();
  });

  it('returns null for corrupted files', async () => {
    const fp = new FileProvider(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'identity'), 'not-valid-base64!', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'identity.pub'), 'not-valid-base64!', 'utf-8');

    const kp = await fp.getKeypair();
    // Keys won't be 32 bytes, so should return null
    expect(kp).toBeNull();
  });

  it('exposes path accessors', () => {
    const fp = new FileProvider(tmpDir);
    expect(fp.getIdentityDir()).toBe(tmpDir);
    expect(fp.getPrivateKeyPath()).toBe(path.join(tmpDir, 'identity'));
    expect(fp.getPublicKeyPath()).toBe(path.join(tmpDir, 'identity.pub'));
  });
});

describe('EnvProvider', () => {
  const origUpKey = process.env.UP_KEY;
  const origDotenvupKey = process.env.DOTENVUP_PRIVATE_KEY;

  afterEach(() => {
    if (origUpKey !== undefined) process.env.UP_KEY = origUpKey;
    else delete process.env.UP_KEY;
    if (origDotenvupKey !== undefined) process.env.DOTENVUP_PRIVATE_KEY = origDotenvupKey;
    else delete process.env.DOTENVUP_PRIVATE_KEY;
  });

  it('returns null when env vars not set', async () => {
    delete process.env.UP_KEY;
    delete process.env.DOTENVUP_PRIVATE_KEY;
    const ep = new EnvProvider();
    expect(await ep.available()).toBe(false);
    expect(await ep.getKeypair()).toBeNull();
  });

  it('reads from UP_KEY and derives public key', async () => {
    const { privateKey } = await generateKeypair();
    process.env.UP_KEY = Buffer.from(privateKey).toString('base64');
    const ep = new EnvProvider();
    expect(await ep.available()).toBe(true);
    const kp = await ep.getKeypair();
    expect(kp).not.toBeNull();
    expect(kp!.privateKey.length).toBe(32);
    expect(kp!.publicKey.length).toBe(32);
  });

  it('is read-only', () => {
    const ep = new EnvProvider();
    expect(ep.writable).toBe(false);
  });

  it('throws on saveKeypair', async () => {
    const ep = new EnvProvider();
    await expect(ep.saveKeypair(new Uint8Array(32), new Uint8Array(32))).rejects.toThrow('read-only');
  });
});

describe('KeyStore (priority chain)', () => {
  it('returns null when no providers have keys', async () => {
    const fp = new FileProvider(tmpDir);
    const store = new KeyStore([fp]);
    expect(await store.hasKeypair()).toBe(false);
    expect(await store.getKeypair()).toBeNull();
  });

  it('returns keypair from first available provider', async () => {
    const fp = new FileProvider(tmpDir);
    const { publicKey, privateKey } = await generateKeypair();
    await fp.saveKeypair(publicKey, privateKey);

    const store = new KeyStore([fp]);
    expect(await store.hasKeypair()).toBe(true);
    const kp = await store.getKeypair();
    expect(Buffer.from(kp!.publicKey)).toEqual(Buffer.from(publicKey));
  });

  it('higher-priority provider wins', async () => {
    // Create two FileProviders with different dirs
    const dir1 = path.join(tmpDir, 'p1');
    const dir2 = path.join(tmpDir, 'p2');
    const fp1 = new FileProvider(dir1);
    const fp2 = new FileProvider(dir2);

    const kp1 = await generateKeypair();
    const kp2 = await generateKeypair();
    await fp1.saveKeypair(kp1.publicKey, kp1.privateKey);
    await fp2.saveKeypair(kp2.publicKey, kp2.privateKey);

    const store = new KeyStore([fp1, fp2]);
    const result = await store.getKeypair();
    expect(Buffer.from(result!.publicKey)).toEqual(Buffer.from(kp1.publicKey));
  });

  it('saveKeypair writes to all writable providers', async () => {
    const dir1 = path.join(tmpDir, 'w1');
    const dir2 = path.join(tmpDir, 'w2');
    const fp1 = new FileProvider(dir1);
    const fp2 = new FileProvider(dir2);

    const store = new KeyStore([fp1, fp2]);
    const { publicKey, privateKey } = await generateKeypair();
    await store.saveKeypair(publicKey, privateKey);

    // Both providers should have the key
    const k1 = await fp1.getKeypair();
    const k2 = await fp2.getKeypair();
    expect(k1).not.toBeNull();
    expect(k2).not.toBeNull();
    expect(Buffer.from(k1!.publicKey)).toEqual(Buffer.from(k2!.publicKey));
  });

  it('saveKeypair skips read-only providers', async () => {
    const fp = new FileProvider(tmpDir);
    // Create a mock read-only provider
    const readOnly: KeyProvider = {
      name: 'readonly-mock',
      writable: false,
      available: async () => true,
      getKeypair: async () => null,
      saveKeypair: async () => { throw new Error('should not be called'); },
    };

    const store = new KeyStore([readOnly, fp]);
    const { publicKey, privateKey } = await generateKeypair();
    // Should not throw — skips readOnly, writes to fp
    await store.saveKeypair(publicKey, privateKey);
    expect(await fp.getKeypair()).not.toBeNull();
  });

  it('saveKeypairTo writes to specific provider', async () => {
    const fp = new FileProvider(tmpDir);
    const store = new KeyStore([fp]);
    const { publicKey, privateKey } = await generateKeypair();
    await store.saveKeypairTo('file', publicKey, privateKey);
    expect(await fp.getKeypair()).not.toBeNull();
  });

  it('saveKeypairTo throws for unknown provider', async () => {
    const store = new KeyStore([new FileProvider(tmpDir)]);
    await expect(
      store.saveKeypairTo('nonexistent', new Uint8Array(32), new Uint8Array(32)),
    ).rejects.toThrow('not found');
  });

  it('getPublicKey and getPrivateKey return correct values', async () => {
    const fp = new FileProvider(tmpDir);
    const { publicKey, privateKey } = await generateKeypair();
    await fp.saveKeypair(publicKey, privateKey);

    const store = new KeyStore([fp]);
    expect(Buffer.from((await store.getPublicKey())!)).toEqual(Buffer.from(publicKey));
    expect(Buffer.from((await store.getPrivateKey())!)).toEqual(Buffer.from(privateKey));
  });

  it('getProvider returns provider by name', () => {
    const fp = new FileProvider(tmpDir);
    const store = new KeyStore([fp]);
    expect(store.getProvider('file')).toBe(fp);
    expect(store.getProvider('nonexistent')).toBeUndefined();
  });
});

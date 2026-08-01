import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  generateKeypair,
  keyFingerprint,
  sealIdentity,
  unsealIdentity,
  saveKeypairEnvelope,
  loadKeypairEnvelope,
  migratePlaintextToEnvelope,
  detectKeyStorageMode,
  archiveIdentity,
  parseIdentityEnvelope,
  FileProvider,
  IDENTITY_ENVELOPE_FILE,
} from '../index.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `dotenvup-env-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('identity envelope', () => {
  it('seals and unseals private key with AEAD binding', async () => {
    const kp = await generateKeypair();
    const wrappingKey = crypto.getRandomValues(new Uint8Array(32));
    const envelope = await sealIdentity(kp.privateKey, kp.publicKey, wrappingKey, {
      source: 'file',
      path: 'wrapping-key',
    });
    const opened = await unsealIdentity(envelope, wrappingKey, kp.publicKey);
    expect(Buffer.from(opened)).toEqual(Buffer.from(kp.privateKey));
  });

  it('rejects swapped header (wrong keyId in AD)', async () => {
    const kp = await generateKeypair();
    const wrappingKey = crypto.getRandomValues(new Uint8Array(32));
    const envelope = await sealIdentity(kp.privateKey, kp.publicKey, wrappingKey, {
      source: 'file',
      path: 'wrapping-key',
    });
    const tampered = { ...envelope, keyId: 'AAAAAAAAAAAA' };
    await expect(unsealIdentity(tampered, wrappingKey, kp.publicKey)).rejects.toThrow(/keyId|decrypt|Failed/i);
  });

  it('rejects wrong wrapping key', async () => {
    const kp = await generateKeypair();
    const wrappingKey = crypto.getRandomValues(new Uint8Array(32));
    const wrong = crypto.getRandomValues(new Uint8Array(32));
    const envelope = await sealIdentity(kp.privateKey, kp.publicKey, wrappingKey, {
      source: 'file',
      path: 'wrapping-key',
    });
    await expect(unsealIdentity(envelope, wrong, kp.publicKey)).rejects.toThrow(/Failed to decrypt|wrong wrapping/i);
  });

  it('roundtrips via disk (file wrap source)', async () => {
    const kp = await generateKeypair();
    await saveKeypairEnvelope(tmpDir, kp.publicKey, kp.privateKey);
    expect(await detectKeyStorageMode(tmpDir)).toBe('file-envelope');
    const loaded = await loadKeypairEnvelope(tmpDir);
    expect(loaded).not.toBeNull();
    expect(Buffer.from(loaded!.privateKey)).toEqual(Buffer.from(kp.privateKey));
    expect(Buffer.from(loaded!.publicKey)).toEqual(Buffer.from(kp.publicKey));
  });

  it('migrates plaintext identity to envelope with bak', async () => {
    const kp = await generateKeypair();
    await fs.writeFile(path.join(tmpDir, 'identity'), Buffer.from(kp.privateKey).toString('base64') + '\n', { mode: 0o600 });
    await fs.writeFile(path.join(tmpDir, 'identity.pub'), Buffer.from(kp.publicKey).toString('base64') + '\n', { mode: 0o644 });

    expect(await detectKeyStorageMode(tmpDir)).toBe('plaintext');
    const result = await migratePlaintextToEnvelope(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.keyId).toBe(await keyFingerprint(kp.publicKey));
    expect(await detectKeyStorageMode(tmpDir)).toBe('file-envelope');

    const bak = await fs.readFile(result!.bakPath, 'utf8');
    expect(Buffer.from(bak.trim(), 'base64')).toEqual(Buffer.from(kp.privateKey));

    const loaded = await loadKeypairEnvelope(tmpDir);
    expect(Buffer.from(loaded!.privateKey)).toEqual(Buffer.from(kp.privateKey));
  });

  it('archives identity materials before overwrite', async () => {
    const kp = await generateKeypair();
    await saveKeypairEnvelope(tmpDir, kp.publicKey, kp.privateKey);
    const keyId = await keyFingerprint(kp.publicKey);
    const dest = await archiveIdentity(tmpDir, keyId);
    const archived = await fs.readFile(path.join(dest, 'identity.enc'), 'utf8');
    const env = parseIdentityEnvelope(archived);
    expect(env.keyId).toBe(keyId);
  });

  it('falls back to plaintext when envelope is corrupt (no key loss)', async () => {
    const kp = await generateKeypair();
    await fs.writeFile(path.join(tmpDir, 'identity'), Buffer.from(kp.privateKey).toString('base64') + '\n', {
      mode: 0o600,
    });
    await fs.writeFile(path.join(tmpDir, 'identity.pub'), Buffer.from(kp.publicKey).toString('base64') + '\n', {
      mode: 0o644,
    });
    await fs.writeFile(path.join(tmpDir, IDENTITY_ENVELOPE_FILE), '{ "format": "dotenvup-identity-envelope", "bogus": true }\n', {
      mode: 0o600,
    });

    expect(await detectKeyStorageMode(tmpDir)).toBe('plaintext');
    const fp = new FileProvider(tmpDir);
    const loaded = await fp.getKeypair();
    expect(loaded).not.toBeNull();
    expect(Buffer.from(loaded!.privateKey)).toEqual(Buffer.from(kp.privateKey));
  });

  it('migrate keeps plaintext until envelope verifies; bak remains', async () => {
    const kp = await generateKeypair();
    await fs.writeFile(path.join(tmpDir, 'identity'), Buffer.from(kp.privateKey).toString('base64') + '\n', {
      mode: 0o600,
    });
    await fs.writeFile(path.join(tmpDir, 'identity.pub'), Buffer.from(kp.publicKey).toString('base64') + '\n', {
      mode: 0o644,
    });

    const result = await migratePlaintextToEnvelope(tmpDir);
    expect(result).not.toBeNull();
    await expect(fs.access(path.join(tmpDir, 'identity'))).rejects.toThrow();
    const bak = await fs.readFile(result!.bakPath, 'utf8');
    expect(Buffer.from(bak.trim(), 'base64')).toEqual(Buffer.from(kp.privateKey));

    const fp = new FileProvider(tmpDir);
    const loaded = await fp.getKeypair();
    expect(Buffer.from(loaded!.privateKey)).toEqual(Buffer.from(kp.privateKey));
    expect(await keyFingerprint(loaded!.publicKey)).toBe(await keyFingerprint(kp.publicKey));
  });
});

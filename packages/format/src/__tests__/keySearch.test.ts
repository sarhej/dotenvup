import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  generateKeypair,
  exportKeyBundle,
  keyFingerprint,
  searchLocalKeys,
  discoverLocalKeyCandidates,
} from '../index.js';

describe('searchLocalKeys', () => {
  let root: string;

  beforeEach(async () => {
    root = path.join(os.tmpdir(), `dotenvup-keysearch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('finds matching identity private key', async () => {
    const keypair = await generateKeypair();
    const requiredKeyId = await keyFingerprint(keypair.publicKey);
    await fs.writeFile(path.join(root, 'identity'), Buffer.from(keypair.privateKey).toString('base64'), 'utf8');

    const summary = await searchLocalKeys({ roots: [root], requiredKeyId });
    expect(summary.results.some((r) => r.status === 'match' && r.type === 'identity-private')).toBe(true);
  });

  it('finds matching key bundle and reports mismatches', async () => {
    const keypair = await generateKeypair();
    const other = await generateKeypair();
    const requiredKeyId = await keyFingerprint(keypair.publicKey);
    const bundle = await exportKeyBundle(keypair, 'correct horse battery staple');
    const otherPub = Buffer.from(other.publicKey).toString('base64');

    await fs.writeFile(path.join(root, 'backup.dotenvup-key'), JSON.stringify(bundle, null, 2), 'utf8');
    await fs.writeFile(path.join(root, 'other.pub'), otherPub, 'utf8');

    const summary = await searchLocalKeys({ roots: [root], requiredKeyId });
    expect(summary.results.some((r) => r.status === 'match' && r.type === 'key-bundle')).toBe(true);
    expect(summary.results.some((r) => r.status === 'mismatch' && r.type === 'public-key')).toBe(true);
  });

  it('marks invalid candidates safely', async () => {
    const keypair = await generateKeypair();
    const requiredKeyId = await keyFingerprint(keypair.publicKey);
    await fs.writeFile(path.join(root, 'broken.dotenvup-key'), '{ not-json', 'utf8');
    await fs.writeFile(path.join(root, 'bad.pub'), 'not-base64', 'utf8');

    const summary = await searchLocalKeys({ roots: [root], requiredKeyId });
    const invalid = summary.results.filter((r) => r.status === 'invalid');
    expect(invalid.length).toBeGreaterThan(0);
  });

  it('discover mode returns candidate statuses', async () => {
    const keypair = await generateKeypair();
    await fs.writeFile(path.join(root, 'teammate.pub'), Buffer.from(keypair.publicKey).toString('base64'), 'utf8');
    const summary = await discoverLocalKeyCandidates({ roots: [root] });
    expect(summary.results.some((r) => r.status === 'candidate' && r.type === 'public-key')).toBe(true);
  });
});


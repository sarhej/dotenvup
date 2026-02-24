import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  addRecipient,
  generateKeypair,
  readRecipientsConfig,
  removeRecipient,
  resolveRecipientPublicKeys,
} from '../index.js';

describe('recipients config', () => {
  let root: string;

  beforeEach(async () => {
    root = path.join(os.tmpdir(), `dotenvup-recipients-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('adds and lists deduped recipients', async () => {
    const kp = await generateKeypair();
    const first = await addRecipient(root, kp.publicKey, 'alice');
    const second = await addRecipient(root, kp.publicKey, 'alice');
    expect(first.keyId).toBe(second.keyId);
    const list = await readRecipientsConfig(root);
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('alice');
  });

  it('resolves local + external keys', async () => {
    const local = await generateKeypair();
    const ext = await generateKeypair();
    await addRecipient(root, ext.publicKey, 'teammate');
    const all = await resolveRecipientPublicKeys(root, local.publicKey);
    expect(all.has('@local')).toBe(true);
    expect(Array.from(all.keys()).some((k) => k === 'teammate')).toBe(true);
  });

  it('removes by label or keyId', async () => {
    const kp = await generateKeypair();
    const rec = await addRecipient(root, kp.publicKey, 'remove-me');
    const removed = await removeRecipient(root, 'remove-me');
    expect(removed).toBe(true);
    const removedAgain = await removeRecipient(root, rec.keyId);
    expect(removedAgain).toBe(false);
  });
});


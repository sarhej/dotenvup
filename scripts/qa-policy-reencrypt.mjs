#!/usr/bin/env node
/**
 * QA helper: attach [policy] to an existing .env.up and reencrypt all recipient blocks.
 * Usage: node scripts/qa-policy-reencrypt.mjs <projectDir> <identityDir>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  KeyStore,
  parse,
  serialize,
  decryptAny,
  reencryptAll,
  resolveRecipientPublicKeys,
} from '@dotenvup/format';

const projectDir = process.argv[2];
const identityDir = process.argv[3];
if (!projectDir || !identityDir) {
  console.error('Usage: qa-policy-reencrypt.mjs <projectDir> <identityDir>');
  process.exit(2);
}

process.env.DOTENVUP_TEST = '1';
process.env.DOTENVUP_IDENTITY_DIR = identityDir;
process.env.DOTENVUP_TEST_IDENTITY_DIR = identityDir;

const store = new KeyStore();
const privateKey = await store.getPrivateKey();
const publicKey = await store.getPublicKey();
if (!privateKey || !publicKey) {
  console.error('No keypair in identity dir');
  process.exit(2);
}

const envUpPath = path.join(projectDir, '.env.up');
const file = parse(fs.readFileSync(envUpPath, 'utf8'));
const { entries, raw, recipient } = await decryptAny(file, privateKey, '@local');

const recipientKeys = await resolveRecipientPublicKeys(projectDir, publicKey);
const recipientIds = Array.from(recipientKeys.keys());

const catalogKeys = file.header.keys.map((k) => k.name);
const shared = catalogKeys.filter((k) => k === 'DB_HOST' || k === 'API_KEY');

file.policy = {
  version: 1,
  rows: recipientIds.map((id) => {
    if (id === '@local') {
      return { recipient: id, keys: [...catalogKeys] };
    }
    if (id === 'bob') {
      return { recipient: id, keys: [...shared] };
    }
    if (id === 'ci') {
      return { recipient: id, keys: ['API_KEY'] };
    }
    return { recipient: id, keys: [...shared] };
  }),
};
file.header.encryptedFor = recipientIds;

const updated = await reencryptAll(file, entries, recipient, recipientKeys, raw);
fs.writeFileSync(envUpPath, serialize(updated));
console.log('[qa-policy-reencrypt] Applied policy for:', recipientIds.join(', '));

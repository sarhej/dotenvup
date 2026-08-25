/**
 * Merge re-encrypt: update editor's block; preserve others byte-identical when undecryptable.
 */

import type { EnvUpFile, EnvUpKey } from './types.js';
import { decrypt as decryptBlock, encryptRecipientBlock, initSodium, keyFingerprint } from './crypto.js';
import {
  filterRawForKeys,
  mergePolicyAware,
  policyKeySetForRecipient,
  validatePolicy,
} from './policy.js';
import { canSyncAllPolicyBlocks, pruneCatalogToPolicy } from './recipientOps.js';

export interface MergeReencryptOptions {
  existing: EnvUpFile;
  editorRecipientId: string;
  newEntries: Record<string, string>;
  rawContent?: string;
  privateKey: Uint8Array;
  recipientPublicKeys: Map<string, Uint8Array>;
  author: string;
}

function bumpKeysMetadata(
  existingKeys: EnvUpKey[],
  merged: Record<string, string>,
  touchedKeys: Set<string>,
  author: string,
): EnvUpKey[] {
  const now = new Date().toISOString();
  const byName = new Map(existingKeys.map((key) => [key.name, key]));

  for (const name of Object.keys(merged)) {
    if (!byName.has(name)) {
      byName.set(name, { name, version: 1, updatedAt: now, author });
      touchedKeys.add(name);
    } else if (touchedKeys.has(name)) {
      const prev = byName.get(name)!;
      byName.set(name, {
        ...prev,
        version: prev.version + 1,
        updatedAt: now,
        author,
      });
    }
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function mergeReencrypt(options: MergeReencryptOptions): Promise<EnvUpFile> {
  const {
    existing,
    editorRecipientId,
    newEntries,
    rawContent,
    privateKey,
    recipientPublicKeys,
    author,
  } = options;

  await initSodium();

  const policy = existing.policy;
  const allowedKeys = policy ? policyKeySetForRecipient(policy, editorRecipientId) : null;

  const editorBlock = existing.encryptedBlocks.find((b) => b.recipient === editorRecipientId);
  if (!editorBlock) {
    throw new Error(`No encrypted block for editor recipient "${editorRecipientId}"`);
  }

  const editorDec = await decryptBlock(editorBlock, privateKey);
  const merged = mergePolicyAware(editorDec.entries, newEntries, allowedKeys);

  const touched = new Set<string>();
  for (const key of Object.keys(newEntries)) {
    if (!(key in editorDec.entries) || editorDec.entries[key] !== newEntries[key]) {
      touched.add(key);
    }
  }
  for (const key of Object.keys(editorDec.entries)) {
    if (!(key in merged) && (!allowedKeys || allowedKeys.has(key))) {
      touched.add(key);
    }
  }

  const updatedCatalog = bumpKeysMetadata(existing.header.keys, merged, touched, author);
  const catalogForFile =
    existing.policy != null
      ? pruneCatalogToPolicy(updatedCatalog, existing.policy)
      : updatedCatalog;

  if (existing.policy) {
    const validation = validatePolicy({
      ...existing,
      header: { ...existing.header, keys: catalogForFile },
    });
    if (!validation.ok) {
      const first = validation.errors[0];
      throw new Error(`Invalid [policy]: ${first.code} ${first.message}`);
    }
  }

  if (
    existing.policy &&
    canSyncAllPolicyBlocks(existing, editorRecipientId, merged, recipientPublicKeys)
  ) {
    const base: EnvUpFile = {
      ...existing,
      header: { ...existing.header, keys: catalogForFile },
    };
    return reencryptAll(
      base,
      merged,
      author,
      recipientPublicKeys,
      rawContent ?? editorDec.raw,
    );
  }

  const editorPubKey =
    recipientPublicKeys.get(editorRecipientId) ?? recipientPublicKeys.get('@local');
  if (!editorPubKey) {
    throw new Error(`Missing public key for editor recipient "${editorRecipientId}"`);
  }

  const slice = allowedKeys ?? new Set(Object.keys(merged));
  const filteredRaw = filterRawForKeys(rawContent ?? editorDec.raw, slice);

  const updatedEditorBlock = await encryptRecipientBlock(
    editorRecipientId,
    editorPubKey,
    merged,
    filteredRaw,
  );

  const encryptedBlocks = existing.encryptedBlocks.map((block) =>
    block.recipient === editorRecipientId ? updatedEditorBlock : block,
  );

  const primaryPubKey = recipientPublicKeys.get(editorRecipientId);
  const keyId = primaryPubKey ? await keyFingerprint(primaryPubKey) : existing.header.keyId;
  const now = new Date().toISOString();

  const header = {
    ...existing.header,
    encryptedBy: author,
    createdAt: now,
    encryptedFor: existing.header.encryptedFor.length
      ? existing.header.encryptedFor
      : Array.from(recipientPublicKeys.keys()),
    keyId,
    keys: catalogForFile,
  };

  return {
    header,
    policy: existing.policy,
    signature: existing.signature,
    encryptedBlocks,
  };
}

/**
 * Full re-encrypt for all recipients (e.g. after policy change).
 */
export async function reencryptAll(
  existing: EnvUpFile,
  entries: Record<string, string>,
  author: string,
  recipientPublicKeys: Map<string, Uint8Array>,
  rawContent?: string,
): Promise<EnvUpFile> {
  await initSodium();
  const { encrypt } = await import('./crypto.js');

  if (existing.policy) {
    const validation = validatePolicy(existing);
    if (!validation.ok) {
      const first = validation.errors[0];
      throw new Error(`Invalid [policy]: ${first.code} ${first.message}`);
    }
  }

  const now = new Date().toISOString();
  const primaryRecipient = recipientPublicKeys.keys().next().value;
  const primaryPubKey = primaryRecipient ? recipientPublicKeys.get(primaryRecipient) : undefined;
  const keyId = primaryPubKey ? await keyFingerprint(primaryPubKey) : existing.header.keyId;

  const encryptedBlocks = await encrypt(
    entries,
    recipientPublicKeys,
    rawContent,
    existing.policy,
  );

  const header = {
    ...existing.header,
    encryptedBy: author,
    createdAt: now,
    encryptedFor: existing.policy
      ? existing.policy.rows.map((r) => r.recipient)
      : Array.from(recipientPublicKeys.keys()),
    keyId,
    keys: existing.header.keys.length
      ? existing.policy
        ? pruneCatalogToPolicy(existing.header.keys, existing.policy)
        : existing.header.keys
      : Object.keys(entries).map((name) => ({
          name,
          version: 1,
          updatedAt: now,
          author,
        })),
  };

  return {
    header,
    policy: existing.policy,
    signature: existing.signature,
    encryptedBlocks,
  };
}

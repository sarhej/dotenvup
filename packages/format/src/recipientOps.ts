/**
 * Recipient / policy file operations (revoke, catalog prune).
 */

import type { EnvUpFile, EnvUpKey, EnvUpPolicy } from './types.js';
import { validatePolicy } from './policy.js';

export function policyReferencedKeys(policy: EnvUpPolicy): Set<string> {
  const out = new Set<string>();
  for (const row of policy.rows) {
    for (const key of row.keys) out.add(key);
  }
  return out;
}

/** Drop `[keys]` rows not listed in any `[policy]` row. */
export function pruneCatalogToPolicy(keys: EnvUpKey[], policy: EnvUpPolicy): EnvUpKey[] {
  const used = policyReferencedKeys(policy);
  return keys.filter((k) => used.has(k.name));
}

/**
 * Remove a recipient from `[policy]`, `[encrypted]`, and `Encrypted-For`.
 * Other blocks are unchanged (revoked key cannot decrypt future commits).
 */
export function revokeRecipientFromFile(file: EnvUpFile, recipientId: string): EnvUpFile {
  if (!file.policy) {
    throw new Error('Cannot revoke recipient: file has no [policy] section');
  }

  const policy: EnvUpPolicy = {
    ...file.policy,
    rows: file.policy.rows.filter((r) => r.recipient !== recipientId),
  };

  if (policy.rows.length === file.policy.rows.length) {
    throw new Error(`Recipient "${recipientId}" not found in [policy]`);
  }

  const encryptedBlocks = file.encryptedBlocks.filter((b) => b.recipient !== recipientId);
  if (encryptedBlocks.length === file.encryptedBlocks.length) {
    throw new Error(`Recipient "${recipientId}" not found in [encrypted]`);
  }

  const encryptedFor = file.header.encryptedFor.filter((r) => r !== recipientId);

  const header = {
    ...file.header,
    encryptedFor,
    keys: pruneCatalogToPolicy(file.header.keys, policy),
  };

  const updated: EnvUpFile = {
    ...file,
    header,
    policy,
    encryptedBlocks,
  };

  const validation = validatePolicy(updated);
  if (!validation.ok) {
    const first = validation.errors[0];
    throw new Error(`Revoke left invalid [policy]: ${first.code} ${first.message}`);
  }

  return updated;
}

/** True when `entries` contains every name in the `[keys]` catalog. */
export function holdsFullCatalog(
  file: EnvUpFile,
  entries: Record<string, string>,
): boolean {
  for (const key of file.header.keys) {
    if (!(key.name in entries)) return false;
  }
  return true;
}

/** Catalog key names missing from the decrypted map (for error messages — names only). */
export function missingCatalogKeys(
  file: EnvUpFile,
  entries: Record<string, string>,
): string[] {
  return file.header.keys.map((k) => k.name).filter((name) => !(name in entries));
}

/** True when editor holds every catalog key and every policy recipient has a known public key. */
export function canSyncAllPolicyBlocks(
  file: EnvUpFile,
  editorRecipientId: string,
  merged: Record<string, string>,
  recipientPublicKeys: Map<string, Uint8Array>,
): boolean {
  if (!file.policy) return false;
  if (!holdsFullCatalog(file, merged)) return false;

  for (const row of file.policy.rows) {
    const hasPub =
      recipientPublicKeys.has(row.recipient) ||
      (row.recipient === editorRecipientId &&
        (recipientPublicKeys.has('@local') || recipientPublicKeys.has(editorRecipientId)));
    if (!hasPub) return false;
  }

  return true;
}

/**
 * Guard for full-file re-encrypt: refuse when the caller only holds a policy slice.
 * Prevents a partial recipient from wiping other recipients' secrets via `reencryptAll`.
 */
export function assertCanReencryptAll(
  file: EnvUpFile,
  editorRecipientId: string,
  entries: Record<string, string>,
  recipientPublicKeys: Map<string, Uint8Array>,
): void {
  if (!file.policy) return;

  if (canSyncAllPolicyBlocks(file, editorRecipientId, entries, recipientPublicKeys)) {
    return;
  }

  const missing = missingCatalogKeys(file, entries);
  if (missing.length > 0) {
    throw new Error(
      `Cannot re-encrypt: your decrypted slice is missing catalog key(s): ${missing.join(', ')}. ` +
        'Only a full-catalog holder may run reencrypt (or import the full set). Use merge import for your slice.',
    );
  }

  throw new Error(
    'Cannot re-encrypt: missing public keys for one or more policy recipients. ' +
      'Add them with `up recipients add`, then retry.',
  );
}

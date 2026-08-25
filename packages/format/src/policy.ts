/**
 * @dotenvup/format — [policy] section parse, validate, and helpers
 */

import type { EnvUpFile, EnvUpPolicy, EnvUpPolicyRow } from './types.js';
import { ParseError } from './types.js';
import { parseEnvFile } from './envParser.js';

export const SUPPORTED_POLICY_VERSION = 1;

export type PolicyErrorCode = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'V1' | 'V3' | 'M1';

export interface PolicyValidationIssue {
  code: PolicyErrorCode;
  message: string;
}

export class PolicyValidationError extends Error {
  constructor(
    public readonly code: PolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PolicyValidationError';
    Object.setPrototypeOf(this, PolicyValidationError.prototype);
  }
}

/** Parse `[policy]` section body lines (without section header). */
export function parsePolicySection(lines: string[]): EnvUpPolicy {
  let version: number | null = null;
  const rows: EnvUpPolicyRow[] = [];
  const seenRecipients = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[')) break;

    if (trimmed.startsWith('version:')) {
      const v = trimmed.slice('version:'.length).trim();
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new ParseError(`Invalid policy version: ${v}`);
      }
      version = n;
      continue;
    }

    const keysIdx = trimmed.indexOf('keys:');
    if (!trimmed.startsWith('recipient:') || keysIdx === -1) {
      throw new ParseError(`Invalid policy line: ${trimmed}`);
    }

    const recipient = trimmed.slice('recipient:'.length, keysIdx).trim();
    if (!recipient) {
      throw new ParseError('Policy row missing recipient id');
    }

    const keysStr = trimmed.slice(keysIdx + 'keys:'.length).trim();
    if (!keysStr) {
      throw new ParseError(`Policy row for ${recipient} has empty keys list`);
    }

    const keys = keysStr.split(',').map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0) {
      throw new ParseError(`Policy row for ${recipient} has empty keys list`);
    }

    if (seenRecipients.has(recipient)) {
      throw new ParseError(`Duplicate policy recipient: ${recipient}`);
    }
    seenRecipients.add(recipient);

    rows.push({ recipient, keys });
  }

  if (version === null) {
    throw new ParseError('Policy section missing version: line');
  }

  return { version, rows };
}

export function serializePolicySection(policy: EnvUpPolicy): string {
  const lines: string[] = ['[policy]', `version: ${policy.version}`];
  for (const row of policy.rows) {
    lines.push(`recipient:${row.recipient}  keys:${row.keys.join(',')}`);
  }
  return lines.join('\n');
}

export function policyKeySetForRecipient(policy: EnvUpPolicy, recipientId: string): Set<string> | null {
  const row = policy.rows.find((r) => r.recipient === recipientId);
  if (!row) return null;
  return new Set(row.keys);
}

export function assertPolicyWritable(policy: EnvUpPolicy): void {
  if (policy.version !== SUPPORTED_POLICY_VERSION) {
    throw new PolicyValidationError('V1', `Unsupported policy version: ${policy.version}`);
  }
}

/** Filter entries to allowed key names. */
export function filterEntries(
  entries: Record<string, string>,
  allowedKeys: Set<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of allowedKeys) {
    if (key in entries) out[key] = entries[key];
  }
  return out;
}

/**
 * Filter raw .env text to lines for allowed keys only (R1/R2).
 * Comments and blank lines are omitted to avoid leaking context about omitted secrets.
 */
export function filterRawForKeys(
  raw: string | undefined,
  allowedKeys: Set<string>,
): string | undefined {
  if (!raw?.trim()) return undefined;

  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = trimmed.replace(/^\s*export\s+/, '');
    const eq = normalized.indexOf('=');
    if (eq === -1) continue;
    const key = normalized.slice(0, eq).trim();
    if (allowedKeys.has(key)) out.push(line);
  }

  return out.length > 0 ? out.join('\n') + '\n' : undefined;
}

export function mergePolicyAware(
  oldEntries: Record<string, string>,
  newEntries: Record<string, string>,
  allowedKeys: Set<string> | null,
): Record<string, string> {
  if (allowedKeys) {
    for (const key of Object.keys(newEntries)) {
      if (!allowedKeys.has(key)) {
        throw new PolicyValidationError('M1', `Key "${key}" is not in your policy slice`);
      }
    }
    // Policy mode: .env is the authoritative state for this recipient's slice (adds + removals).
    const merged: Record<string, string> = {};
    for (const key of allowedKeys) {
      if (key in newEntries) merged[key] = newEntries[key];
    }
    return merged;
  }

  const merged = { ...oldEntries };
  for (const [key, value] of Object.entries(newEntries)) {
    merged[key] = value;
  }
  return merged;
}

export interface ValidatePolicyOptions {
  /** When true, Encrypted-For mismatch is an error (default). Set false for warn-only callers. */
  strictEncryptedFor?: boolean;
}

export interface ValidatePolicyResult {
  ok: boolean;
  errors: PolicyValidationIssue[];
}

export function validatePolicy(
  file: EnvUpFile,
  options?: ValidatePolicyOptions,
): ValidatePolicyResult {
  const errors: PolicyValidationIssue[] = [];
  const policy = file.policy;

  if (!policy) {
    return { ok: true, errors: [] };
  }

  if (policy.version !== SUPPORTED_POLICY_VERSION) {
    errors.push({ code: 'V1', message: `Unsupported policy version: ${policy.version}` });
  }

  const catalog = new Set(file.header.keys.map((k) => k.name));
  const policyRecipients = new Set<string>();
  const encryptedRecipients = new Set(file.encryptedBlocks.map((b) => b.recipient));

  for (const row of policy.rows) {
    policyRecipients.add(row.recipient);
    for (const key of row.keys) {
      if (!catalog.has(key)) {
        errors.push({ code: 'P1', message: `Policy key "${key}" not in [keys] catalog` });
      }
    }
  }

  for (const recipient of encryptedRecipients) {
    if (!policyRecipients.has(recipient)) {
      errors.push({ code: 'P2', message: `Encrypted block for "${recipient}" has no policy row` });
    }
  }

  for (const recipient of policyRecipients) {
    if (!encryptedRecipients.has(recipient)) {
      errors.push({ code: 'P3', message: `Policy row for "${recipient}" has no encrypted block` });
    }
  }

  const headerFor = new Set(file.header.encryptedFor);
  const strict = options?.strictEncryptedFor !== false;
  if (strict && policyRecipients.size > 0) {
    for (const r of policyRecipients) {
      if (!headerFor.has(r)) {
        errors.push({ code: 'P4', message: `Policy recipient "${r}" missing from Encrypted-For header` });
      }
    }
    for (const r of headerFor) {
      if (!policyRecipients.has(r)) {
        errors.push({ code: 'P4', message: `Encrypted-For "${r}" missing from [policy]` });
      }
    }
  }

  const rowIds = policy.rows.map((r) => r.recipient);
  if (new Set(rowIds).size !== rowIds.length) {
    errors.push({ code: 'P5', message: 'Duplicate recipient ids in [policy]' });
  }

  return { ok: errors.length === 0, errors };
}

/** Verify decrypted entries are a subset of policy for that recipient (V3). */
export function verifyDecryptedSubset(
  recipientId: string,
  entries: Record<string, string>,
  policy: EnvUpPolicy,
): PolicyValidationIssue[] {
  const allowed = policyKeySetForRecipient(policy, recipientId);
  if (!allowed) {
    return [{ code: 'V3', message: `No policy row for decrypted recipient "${recipientId}"` }];
  }

  const issues: PolicyValidationIssue[] = [];
  for (const key of Object.keys(entries)) {
    if (!allowed.has(key)) {
      issues.push({
        code: 'V3',
        message: `Recipient "${recipientId}" decrypted key "${key}" not allowed by policy`,
      });
    }
  }
  return issues;
}

/**
 * Fail closed when ciphertext is a superset of cleartext policy (stale / legacy block).
 * Call after decrypt on unlock / run / Safe Edit open.
 */
export function assertDecryptRespectsPolicy(
  recipientId: string,
  entries: Record<string, string>,
  policy: EnvUpPolicy | undefined,
): void {
  if (!policy) return;
  const issues = verifyDecryptedSubset(recipientId, entries, policy);
  if (issues.length === 0) return;
  const first = issues[0];
  throw new PolicyValidationError(
    first.code,
    `${first.message}. Ciphertext exceeds [policy] — run \`up verify\`, then a full-catalog holder must \`up reencrypt\`.`,
  );
}

/** Quick sanity: parsed env keys from filtered raw must not exceed allowed set. */
export function rawRespectsKeyFilter(raw: string | undefined, allowedKeys: Set<string>): boolean {
  if (!raw?.trim()) return true;
  const parsed = parseEnvFile(raw);
  return Object.keys(parsed).every((k) => allowedKeys.has(k));
}

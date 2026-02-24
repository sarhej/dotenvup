import * as fs from 'fs/promises';
import * as path from 'path';
import { keyFingerprint } from './crypto.js';

export const RECIPIENTS_FILE = '.dotenvup.recipients.json';

export interface RecipientConfigEntry {
  keyId: string;
  publicKey: string; // base64
  label?: string;
  addedAt: string;
}

interface RecipientsFileShape {
  version: 1;
  recipients: RecipientConfigEntry[];
}

function configPath(rootDir: string): string {
  return path.join(rootDir, RECIPIENTS_FILE);
}

function assertValidEntry(entry: RecipientConfigEntry): void {
  if (!entry.keyId || !entry.publicKey || !entry.addedAt) {
    throw new Error('Invalid recipient entry.');
  }
  const pub = new Uint8Array(Buffer.from(entry.publicKey, 'base64'));
  if (pub.length !== 32) {
    throw new Error('Recipient public key must be 32 bytes.');
  }
}

export async function readRecipientsConfig(rootDir: string): Promise<RecipientConfigEntry[]> {
  const p = configPath(rootDir);
  try {
    const raw = await fs.readFile(p, 'utf8');
    const parsed = JSON.parse(raw) as RecipientsFileShape;
    if (parsed.version !== 1 || !Array.isArray(parsed.recipients)) return [];
    const out: RecipientConfigEntry[] = [];
    for (const r of parsed.recipients) {
      assertValidEntry(r);
      out.push(r);
    }
    const seen = new Set<string>();
    return out.filter((r) => {
      if (seen.has(r.keyId)) return false;
      seen.add(r.keyId);
      return true;
    });
  } catch {
    return [];
  }
}

export async function writeRecipientsConfig(rootDir: string, recipients: RecipientConfigEntry[]): Promise<void> {
  const out = recipients.map((r) => ({ ...r }));
  for (const r of out) assertValidEntry(r);
  const seen = new Set<string>();
  const deduped = out.filter((r) => {
    if (seen.has(r.keyId)) return false;
    seen.add(r.keyId);
    return true;
  });
  const payload: RecipientsFileShape = { version: 1, recipients: deduped };
  await fs.writeFile(configPath(rootDir), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function addRecipient(
  rootDir: string,
  publicKey: Uint8Array,
  label?: string,
): Promise<RecipientConfigEntry> {
  const keyId = await keyFingerprint(publicKey);
  const current = await readRecipientsConfig(rootDir);
  const existing = current.find((r) => r.keyId === keyId);
  if (existing) return existing;
  const entry: RecipientConfigEntry = {
    keyId,
    publicKey: Buffer.from(publicKey).toString('base64'),
    label: label?.trim() || undefined,
    addedAt: new Date().toISOString(),
  };
  current.push(entry);
  await writeRecipientsConfig(rootDir, current);
  return entry;
}

export async function removeRecipient(rootDir: string, keyIdOrLabel: string): Promise<boolean> {
  const current = await readRecipientsConfig(rootDir);
  const trimmed = keyIdOrLabel.trim();
  const next = current.filter((r) => r.keyId !== trimmed && r.label !== trimmed);
  if (next.length === current.length) return false;
  await writeRecipientsConfig(rootDir, next);
  return true;
}

export async function resolveRecipientPublicKeys(
  rootDir: string,
  localPublicKey: Uint8Array | null,
): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  if (localPublicKey) {
    out.set('@local', localPublicKey);
  }
  const cfg = await readRecipientsConfig(rootDir);
  for (const r of cfg) {
    const pub = new Uint8Array(Buffer.from(r.publicKey, 'base64'));
    if (pub.length !== 32) continue;
    if (localPublicKey && Buffer.from(pub).equals(Buffer.from(localPublicKey))) continue;
    out.set(r.label?.trim() || r.keyId, pub);
  }
  return out;
}


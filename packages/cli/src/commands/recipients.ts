import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  addRecipient,
  discoverLocalKeyCandidates,
  parseKeyBundle,
  readRecipientsConfig,
  removeRecipient,
} from '@dotenvup/format';
import * as logger from '../logger.js';

function ensurePublicKey32(base64: string): Uint8Array {
  const pub = new Uint8Array(Buffer.from(base64.trim(), 'base64'));
  if (pub.length !== 32) {
    throw new Error('Public key must decode to 32 bytes.');
  }
  return pub;
}

function parseOptionalLabel(options?: Record<string, boolean | string>): string | undefined {
  const v = options?.label;
  return typeof v === 'string' ? v.trim() || undefined : undefined;
}

async function parsePublicKeyInput(input: string): Promise<Uint8Array> {
  const maybePath = path.resolve(process.cwd(), input);
  if (fs.existsSync(maybePath) && fs.statSync(maybePath).isFile()) {
    const raw = fs.readFileSync(maybePath, 'utf8').trim();
    if (raw.startsWith('{')) {
      const bundle = parseKeyBundle(raw);
      return ensurePublicKey32(bundle.publicKey);
    }
    return ensurePublicKey32(raw);
  }
  return ensurePublicKey32(input);
}

export async function runList(rootDir = process.cwd()): Promise<void> {
  const recipients = await readRecipientsConfig(rootDir);
  if (recipients.length === 0) {
    logger.info('No additional recipients configured.');
    return;
  }
  logger.info(`Configured recipients (${recipients.length}):`);
  for (const r of recipients) {
    logger.info(`- ${r.label || r.keyId} (${r.keyId})`);
  }
}

export async function runAdd(
  pubOrFile: string | undefined,
  options?: Record<string, boolean | string>,
  rootDir = process.cwd(),
): Promise<void> {
  if (!pubOrFile) {
    logger.error('Usage: up recipients add <publicKey|file> [--label name]');
    process.exitCode = 1;
    return;
  }
  try {
    const pub = await parsePublicKeyInput(pubOrFile);
    const entry = await addRecipient(rootDir, pub, parseOptionalLabel(options));
    logger.info(`Recipient added: ${entry.label || entry.keyId} (${entry.keyId})`);
  } catch (err) {
    logger.error('Failed to add recipient', err);
    process.exitCode = 1;
  }
}

export async function runRemove(idOrLabel: string | undefined, rootDir = process.cwd()): Promise<void> {
  if (!idOrLabel) {
    logger.error('Usage: up recipients remove <keyId|label>');
    process.exitCode = 1;
    return;
  }
  const removed = await removeRecipient(rootDir, idOrLabel);
  if (!removed) {
    logger.warn(`No recipient found for "${idOrLabel}"`);
    process.exitCode = 1;
    return;
  }
  logger.info(`Removed recipient: ${idOrLabel}`);
}

export async function runDiscover(
  options?: Record<string, boolean | string>,
  rootDir = process.cwd(),
): Promise<void> {
  const deep = options?.deep === true;
  const roots = deep
    ? [os.homedir()]
    : [
        rootDir,
        path.join(os.homedir(), '.dotenvup'),
        path.join(os.homedir(), 'Desktop'),
        path.join(os.homedir(), 'Documents'),
        path.join(os.homedir(), 'Downloads'),
      ];
  const summary = await discoverLocalKeyCandidates({
    roots,
    maxDepth: deep ? 12 : 6,
    maxFiles: deep ? 50000 : 6000,
  });
  const candidates = summary.results.filter((r) => r.status === 'candidate');
  if (candidates.length === 0) {
    logger.warn(`No valid key candidates found (scanned ${summary.scannedFiles} files).`);
    return;
  }
  logger.info(`Key candidates (${candidates.length}):`);
  for (const c of candidates) {
    logger.info(`- [${c.type}] ${c.keyId} :: ${c.path}`);
  }
}


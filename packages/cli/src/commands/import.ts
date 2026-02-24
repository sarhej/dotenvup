/**
 * up import [file] — Convert .env to .env.up
 */

import * as path from 'path';
import * as fs from 'fs';
import { create, resolveRecipientPublicKeys, serialize } from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as author from '../author.js';
import { parseEnvFile } from '../envParser.js';
import * as logger from '../logger.js';

export async function run(filePath?: string, options?: { delete?: boolean }): Promise<void> {
  const cwd = process.cwd();
  const inputPath = path.resolve(cwd, filePath || '.env');

  if (!fs.existsSync(inputPath)) {
    logger.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(inputPath);
  if (!stat.isFile()) {
    logger.error(`${inputPath} is not a file (got ${stat.isDirectory() ? 'directory' : 'other'}).`);
    process.exit(1);
  }

  const publicKey = await keystore.getPublicKey();
  if (!publicKey) {
    logger.error('No keypair found. Run: up init');
    process.exit(1);
  }

  let content: string;
  try {
    const buf = fs.readFileSync(inputPath);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    content = decoder.decode(buf);
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (msg.includes('decode') || msg.includes('utf-8') || msg.includes('utf8') || msg.includes('encoding')) {
      logger.error(`Invalid UTF-8 in ${inputPath}. Ensure the file is UTF-8 encoded.`);
      process.exit(1);
    }
    throw err;
  }
  const entries = parseEnvFile(content);

  if (Object.keys(entries).length === 0) {
    logger.error('No valid KEY=VALUE entries found.');
    process.exit(1);
  }

  const authorId = author.getAuthor();
  const recipientPublicKeys = await resolveRecipientPublicKeys(path.dirname(inputPath), publicKey);
  const file = await create(entries, authorId, recipientPublicKeys, content);
  const output = serialize(file);

  const outPath = path.join(path.dirname(inputPath), '.env.up');
  fs.writeFileSync(outPath, output, 'utf8');

  logger.info(`Imported ${Object.keys(entries).length} keys to ${outPath}`);

  if (options?.delete && inputPath !== outPath) {
    fs.unlinkSync(inputPath);
    logger.info(`Deleted ${inputPath}`);
  }
}

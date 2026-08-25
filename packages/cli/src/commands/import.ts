/**
 * up import [file] — Convert .env to .env.up
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  create,
  parse,
  serialize,
  decryptAny,
  mergeReencrypt,
  resolveRecipientPublicKeys,
  PolicyValidationError,
  writeEnvUpAtomic,
} from '@dotenvup/format';
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

  const privateKey = await keystore.getPrivateKey();
  if (!privateKey) {
    logger.error('No private key available. Run: up init');
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
  const projectDir = path.dirname(inputPath);
  const recipientPublicKeys = await resolveRecipientPublicKeys(projectDir, publicKey);
  const outPath = path.join(projectDir, '.env.up');

  let file;
  try {
    if (fs.existsSync(outPath)) {
      const existing = parse(fs.readFileSync(outPath, 'utf8'));
      const { recipient } = await decryptAny(existing, privateKey, '@local');
      file = await mergeReencrypt({
        existing,
        editorRecipientId: recipient,
        newEntries: entries,
        rawContent: content,
        privateKey,
        recipientPublicKeys,
        author: authorId,
      });
      logger.info(`Merged import for recipient ${recipient}`);
    } else {
      file = await create(entries, authorId, recipientPublicKeys, content);
    }
  } catch (err) {
    if (err instanceof PolicyValidationError) {
      logger.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const output = serialize(file);
  try {
    await writeEnvUpAtomic(outPath, output, privateKey);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  logger.info(`Imported ${Object.keys(entries).length} keys to ${outPath}`);

  if (options?.delete && inputPath !== outPath) {
    fs.unlinkSync(inputPath);
    logger.info(`Deleted ${inputPath}`);
  }
}

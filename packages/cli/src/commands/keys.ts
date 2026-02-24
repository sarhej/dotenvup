/**
 * up keys — List key metadata (no decryption)
 */

import * as path from 'path';
import * as fs from 'fs';
import { parseHeader } from '@dotenvup/format';
import * as logger from '../logger.js';

export async function run(options?: { json?: boolean }): Promise<void> {
  const cwd = process.cwd();
  const envUpPath = path.join(cwd, '.env.up');

  if (!fs.existsSync(envUpPath)) {
    logger.error('.env.up not found. Run: up import .env');
    process.exit(1);
  }
  if (!fs.statSync(envUpPath).isFile()) {
    logger.error('.env.up is not a file.');
    process.exit(1);
  }

  const content = fs.readFileSync(envUpPath, 'utf8');
  const header = parseHeader(content);

  if (options?.json) {
    const result = header.keys.map((key) => ({
      name: key.name,
      version: key.version,
      updatedAt: key.updatedAt,
      author: key.author,
      ...(key.note ? { note: key.note } : {}),
    }));
    console.log(JSON.stringify(result));
    return;
  }

  const colWidth = { name: 24, version: 6, updated: 22, author: 12 };
  const pad = (s: string, w: number) => (s.length >= w ? s : s + ' '.repeat(w - s.length));

  logger.info(pad('NAME', colWidth.name) + ' ' + pad('VER', colWidth.version) + ' ' + pad('UPDATED', colWidth.updated) + ' ' + pad('AUTHOR', colWidth.author));
  logger.info('-'.repeat(colWidth.name + colWidth.version + colWidth.updated + colWidth.author + 3));

  for (const key of header.keys) {
    const ver = key.version === 1 ? 'v1' : `v${key.version}`;
    logger.info(
      pad(key.name, colWidth.name) +
        ' ' +
        pad(ver, colWidth.version) +
        ' ' +
        pad(key.updatedAt, colWidth.updated) +
        ' ' +
        pad(key.author, colWidth.author) +
        (key.note ? `  # ${key.note}` : ''),
    );
  }
}

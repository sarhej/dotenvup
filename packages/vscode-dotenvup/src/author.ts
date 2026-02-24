/**
 * Optional author nickname for Encrypted-By in .env.up.
 * Stored at ~/.dotenvup/nickname so it's shared across IDEs and CLI.
 */

import * as path from 'path';
import * as fs from 'fs/promises';

const NICKNAME_MAX_LEN = 64;
const NICKNAME_FILE = 'nickname';

export function getNicknamePath(identityDir: string): string {
  return path.join(identityDir, NICKNAME_FILE);
}

/** Get author string for .env.up header (nickname or '@local'). */
export async function getAuthor(identityDir: string): Promise<string> {
  try {
    const p = getNicknamePath(identityDir);
    const raw = await fs.readFile(p, 'utf8');
    const nick = raw.trim().replace(/\s+/g, ' ').slice(0, NICKNAME_MAX_LEN);
    return nick.length > 0 ? nick : '@local';
  } catch {
    return '@local';
  }
}

/** Save optional nickname; empty string clears it. */
export async function setNickname(identityDir: string, nickname: string): Promise<void> {
  const sanitized = nickname.trim().replace(/\s+/g, ' ').slice(0, NICKNAME_MAX_LEN);
  const p = getNicknamePath(identityDir);
  if (sanitized.length === 0) {
    try {
      await fs.unlink(p);
    } catch {
      // ignore
    }
    return;
  }
  await fs.mkdir(identityDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(p, sanitized + '\n', 'utf8');
}

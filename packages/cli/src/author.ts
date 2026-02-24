/**
 * Optional author nickname for Encrypted-By in .env.up.
 * Stored at ~/.dotenvup/nickname (shared with extension).
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const IDENTITY_DIR = path.join(os.homedir(), '.dotenvup');
const NICKNAME_FILE = 'nickname';
const NICKNAME_MAX_LEN = 64;

function getNicknamePath(): string {
  return path.join(IDENTITY_DIR, NICKNAME_FILE);
}

/** Get author string for .env.up header (nickname or '@local'). */
export function getAuthor(): string {
  try {
    const p = getNicknamePath();
    const raw = fs.readFileSync(p, 'utf8');
    const nick = raw.trim().replace(/\s+/g, ' ').slice(0, NICKNAME_MAX_LEN);
    return nick.length > 0 ? nick : '@local';
  } catch {
    return '@local';
  }
}

/** Save optional nickname; empty string clears it. */
export function setNickname(nickname: string): void {
  const sanitized = nickname.trim().replace(/\s+/g, ' ').slice(0, NICKNAME_MAX_LEN);
  const p = getNicknamePath();
  if (sanitized.length === 0) {
    try {
      fs.unlinkSync(p);
    } catch {
      // ignore
    }
    return;
  }
  if (!fs.existsSync(IDENTITY_DIR)) {
    fs.mkdirSync(IDENTITY_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(p, sanitized + '\n', 'utf8');
}

/**
 * up unlock — Decrypt .env.up and write .env
 * Optional --duration 5m|15m|30m|1h|2h to auto-lock after elapsed time
 * Optional --until-terminal-exit: spawn shell, lock when it exits
 * If no --duration and TTY: prompts for duration (default 5m)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { spawn } from 'child_process';
import { parse, decryptAny } from '@dotenvup/format';
import * as keystore from '../keystore.js';
import { parseEnvFile, entriesMatch } from '../envParser.js';
import * as logger from '../logger.js';

const DEFAULT_DURATION = '5m';

function isPermanent(s: string): boolean {
  return /^(never|perm|permanent|forever|0)$/i.test(s.trim());
}

function parseDuration(s: string): number | null {
  if (isPermanent(s)) return null; // null = no auto-lock
  const m = s.match(/^(\d+)(m|h|s)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  return null;
}

async function promptDuration(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`How long to unlock? [${DEFAULT_DURATION}] (or "never" for permanent): `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || DEFAULT_DURATION);
    });
  });
}

async function promptOverwrite(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Existing .env has local changes. Unlock will overwrite. Proceed? [y/N]: ', (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function formatEnvLine(key: string, value: string): string {
  if (value.includes('"') || value.includes('\n') || value.includes(' ')) {
    return `${key}="${value.replace(/"/g, '\\"')}"`;
  }
  return `${key}=${value}`;
}

function scheduleAutoLock(envPath: string, ms: number): void {
  const script = `const fs=require('fs'),p=process.env.UP_AUTOLOCK_ENV;setTimeout(()=>{try{fs.unlinkSync(p)}catch{}},${ms})`;
  const child = spawn(process.execPath, ['-e', script], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, UP_AUTOLOCK_ENV: envPath },
  });
  child.unref();
}

export async function run(options?: {
  duration?: string;
  untilTerminalExit?: boolean;
  force?: boolean;
}): Promise<void> {
  const cwd = process.cwd();
  const envUpPath = path.join(cwd, '.env.up');
  const envPath = path.join(cwd, '.env');
  const envTmpPath = path.join(cwd, '.env.tmp');

  if (!fs.existsSync(envUpPath)) {
    logger.error('.env.up not found. Run: up import .env');
    process.exit(1);
  }

  const stat = fs.statSync(envUpPath);
  if (!stat.isFile()) {
    logger.error('.env.up is not a file (got directory or other).');
    process.exit(1);
  }

  const privateKey = await keystore.getPrivateKey();
  if (!privateKey) {
    logger.error('No keypair found. Run: up init');
    process.exit(1);
  }

  const content = fs.readFileSync(envUpPath, 'utf8');
  const file = parse(content);

  const result = await decryptAny(file, privateKey, '@local');
  const { entries, raw: rawContent } = result;

  // Overwrite check: if .env exists and differs
  if (fs.existsSync(envPath)) {
    const existingContent = fs.readFileSync(envPath, 'utf8');
    const existingEntries = parseEnvFile(existingContent);
    if (!entriesMatch(existingEntries, entries)) {
      const force = options?.force ?? false;
      if (!force) {
        if (process.stdin.isTTY) {
          const ok = await promptOverwrite();
          if (!ok) {
            logger.info('Cancelled.');
            return;
          }
        } else {
          logger.error('Existing .env has local changes. Use --force to overwrite.');
          process.exit(1);
        }
      }
    }
  }

  // Atomic write: prefer raw content (preserves comments/structure) over reconstructed entries
  const out = rawContent ?? Object.entries(entries).map(([k, v]) => formatEnvLine(k, v)).join('\n') + '\n';
  fs.writeFileSync(envTmpPath, out, 'utf8');
  fs.renameSync(envTmpPath, envPath);

  logger.info(`Unlocked — ${Object.keys(entries).length} keys written to .env`);

  if (options?.untilTerminalExit) {
    if (!process.stdin.isTTY) {
      logger.error('Use --duration for non-interactive unlock.');
      process.exit(1);
    }
    const shell =
      process.env.SHELL || process.env.COMSPEC || (process.platform === 'win32' ? 'cmd' : 'sh');
    const child = spawn(shell, [], { stdio: 'inherit', cwd });

    const cleanup = () => {
      try {
        if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
      } catch {}
    };

    child.on('exit', (code, signal) => {
      cleanup();
      // 128 + signal number; SIGINT=2, SIGTERM=15
      const exitCode = signal ? 128 + (signal === 'SIGTERM' ? 15 : 2) : code ?? 0;
      process.exit(exitCode);
    });

    process.on('SIGINT', () => {
      cleanup();
      process.exit(128 + 2); // 130 = SIGINT
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(128 + 15); // 143 = SIGTERM
    });

    return;
  }

  let durationStr = options?.duration;
  if (durationStr === undefined || durationStr === '') {
    if (process.stdin.isTTY) {
      durationStr = await promptDuration();
    } else {
      durationStr = DEFAULT_DURATION;
    }
  }

  const ms = parseDuration(durationStr);
  if (ms !== null) {
    if (ms > 0) {
      scheduleAutoLock(envPath, ms);
      logger.info(`Auto-lock scheduled in ${durationStr}`);
    } else {
      logger.error(`Invalid duration "${durationStr}". Use 5m, 15m, 30m, 1h, 2h or "never" for permanent`);
      process.exit(1);
    }
  } else if (!isPermanent(durationStr)) {
    logger.error(`Invalid duration "${durationStr}". Use 5m, 15m, 30m, 1h, 2h or "never" for permanent`);
    process.exit(1);
  } else {
    logger.info('Unlocked permanently (no auto-lock)');
  }
}

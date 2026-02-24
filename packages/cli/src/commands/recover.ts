import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse } from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as logger from '../logger.js';

export interface RecoverOptions {
  deep?: boolean;
  json?: boolean;
}

function quickRoots(cwd: string): string[] {
  return [
    cwd,
    keystore.getIdentityDir(),
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Downloads'),
  ];
}

export async function run(envUpFile?: string, options?: RecoverOptions): Promise<void> {
  const cwd = process.cwd();
  const envUpPath = path.resolve(cwd, envUpFile ?? '.env.up');
  if (!fs.existsSync(envUpPath)) {
    logger.error(`${envUpPath} not found.`);
    process.exitCode = 1;
    return;
  }

  const content = fs.readFileSync(envUpPath, 'utf8');
  const file = parse(content);
  const requiredKeyId = file.header.keyId;
  if (!requiredKeyId) {
    logger.error('.env.up has no Key-Id in header; cannot run key-match recovery scan.');
    process.exitCode = 1;
    return;
  }

  const currentKeyId = await keystore.getKeyId();
  const roots = options?.deep ? [os.homedir()] : quickRoots(path.dirname(envUpPath));
  const formatLib = await import('@dotenvup/format');
  const searchLocalKeys = (formatLib as Record<string, unknown>)['searchLocalKeys'] as (
    o: { requiredKeyId: string; roots: string[]; maxDepth?: number; maxFiles?: number }
  ) => Promise<{ scannedFiles: number; truncated: boolean; results: Array<{ status: string; type: string; path: string }> }>;
  if (!searchLocalKeys) {
    logger.error('Recovery scanner is unavailable. Rebuild @dotenvup/format and retry.');
    process.exitCode = 1;
    return;
  }
  const summary = await searchLocalKeys({
    requiredKeyId,
    roots,
    maxDepth: options?.deep ? 12 : 6,
    maxFiles: options?.deep ? 50000 : 6000,
  });
  const matches = summary.results.filter((r) => r.status === 'match');

  if (options?.json) {
    process.stdout.write(`${JSON.stringify({
      requiredKeyId,
      currentKeyId,
      envUpPath,
      ...summary,
    }, null, 2)}\n`);
    return;
  }

  logger.info(`Recovery scan for ${path.basename(envUpPath)}`);
  logger.info(`Required Key-Id: ${requiredKeyId}`);
  logger.info(`Current Key-Id: ${currentKeyId ?? 'none'}`);
  logger.info(`Scanned files: ${summary.scannedFiles}${summary.truncated ? ' (truncated by maxFiles limit)' : ''}`);

  if (matches.length === 0) {
    logger.warn('No matching key was found on this machine.');
    logger.info('Next steps:');
    logger.info('  1) From old computer: up key export backup.dotenvup-key');
    logger.info('  2) On this computer: up key import backup.dotenvup-key');
    logger.info('  3) Retry unlock/lock');
    return;
  }

  logger.info(`Found ${matches.length} matching candidate(s):`);
  for (const m of matches) {
    logger.info(`  - [${m.type}] ${m.path}`);
  }

  const privateCandidates = matches.filter((m) => m.type === 'identity-private' || m.type === 'key-bundle');
  if (privateCandidates.length > 0) {
    logger.info('Import hints:');
    for (const c of privateCandidates) {
      if (c.type === 'key-bundle') {
        logger.info(`  up key import "${c.path}"`);
      } else {
        logger.info(`  copy "${c.path}" to "${path.join(keystore.getIdentityDir(), 'identity')}" (advanced)`);
      }
    }
  } else {
    logger.warn('Only public-key matches were found; private key is still required for decryption.');
  }
}


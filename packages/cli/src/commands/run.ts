/**
 * up run -- <cmd> — Run command with decrypted env vars (in-memory, no .env written)
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { parse, decryptAny } from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as logger from '../logger.js';

export async function run(args: string[]): Promise<void> {
  if (args.length === 0) {
    logger.error('Usage: up run -- <command> [args...]');
    logger.info('Example: up run -- npm start');
    process.exit(1);
  }

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

  const privateKey = await keystore.getPrivateKey();
  if (!privateKey) {
    logger.error('No keypair found. Run: up init');
    process.exit(1);
  }

  const content = fs.readFileSync(envUpPath, 'utf8');
  const file = parse(content);
  const { entries } = await decryptAny(file, privateKey, '@local');

  const env = { ...process.env, ...entries };

  const [cmd, ...cmdArgs] = args;
  logger.debug(`Spawning child process: ${cmd}`, { cmdArgs });
  // Intentional: `up run` executes the caller-supplied command with decrypted env.
  // Same trust model as a shell; args are CLI argv after `--`, not remote input.
  // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process
  const child = spawn(cmd, cmdArgs, {
    stdio: 'inherit',
    env,
  });

  child.on('close', (code, signal) => {
    logger.debug(`Child process exited with code ${code} and signal ${signal}`);
    process.exit(code ?? (signal ? 1 : 0));
  });
}

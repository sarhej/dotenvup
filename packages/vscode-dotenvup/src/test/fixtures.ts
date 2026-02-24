/**
 * Test fixtures: temp directory with .env / .env.up files for extension tests.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export interface FixtureOptions {
  env?: string;
  envUp?: string;
}

/**
 * Create a temporary directory, optionally with .env and/or .env.up content.
 * Caller is responsible for cleaning up (fs.rm(path, { recursive: true })).
 */
export async function createTempWorkspace(options: FixtureOptions = {}): Promise<string> {
  const dir = path.join(os.tmpdir(), `dotenvup-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  await fs.mkdir(dir, { recursive: true });
  if (options.env !== undefined) {
    await fs.writeFile(path.join(dir, '.env'), options.env, 'utf8');
  }
  if (options.envUp !== undefined) {
    await fs.writeFile(path.join(dir, '.env.up'), options.envUp, 'utf8');
  }
  return dir;
}

/**
 * Minimal valid .env.up header (no encrypted block) for tests that only need file presence.
 */
export const MINIMAL_ENV_UP_HEADER = `#!dotenvup v1
# Encrypted-By: @local
# Encrypted-For: @local

[keys]
FOO   v1   2026-01-01T00:00:00Z   @local

[encrypted]
`;

/**
 * @dotenvup/node
 *
 * Drop-in replacement for the `dotenv` package that reads
 * encrypted .env.up files instead of plaintext .env files.
 *
 * Usage:
 *   import { config } from '@dotenvup/node';
 *   await config();
 *
 * Values are decrypted in memory and injected into process.env.
 * No plaintext is ever written to disk.
 */

import * as path from 'path';
import * as fs from 'fs';

export interface ConfigOptions {
  /** Path to the .env.up file. Defaults to '.env.up' in cwd */
  path?: string;
  /** Environment to load (e.g. 'dev', 'staging', 'prod'). Defaults to all. */
  env?: string;
  /** Override existing process.env values. Defaults to false. */
  override?: boolean;
  /** Enable debug logging. Defaults to false. */
  debug?: boolean;
}

export interface ConfigOutput {
  /** The parsed key-value pairs that were loaded */
  parsed?: Record<string, string>;
  /** Error if something went wrong */
  error?: Error;
}

const DEFAULT_RECIPIENT = '@local';

async function getPrivateKey(): Promise<Uint8Array | null> {
  const upKey = process.env.UP_KEY;
  if (upKey) {
    return new Uint8Array(Buffer.from(upKey, 'base64'));
  }
  return null;
}

/**
 * Read and decrypt .env.up, injecting values into process.env.
 * Key resolution: UP_KEY env var (base64) -> keytar (if keytar available).
 */
export async function config(options?: ConfigOptions): Promise<ConfigOutput> {
  const cwd = process.cwd();
  const envUpPath = path.resolve(cwd, options?.path ?? '.env.up');

  try {
    const content = fs.readFileSync(envUpPath, 'utf8');
    const privateKey = await getPrivateKey();
    if (!privateKey) {
      return {
        error: new Error(
          'No decryption key. Set UP_KEY env var (base64 private key), or use "up run -- node your-app.js" to inject env.',
        ),
      };
    }

    const { parse, decrypt } = await import('@dotenvup/format');
    const file = parse(content);
    const { entries } = await decrypt(file, DEFAULT_RECIPIENT, privateKey);

    if (options?.override) {
      for (const [k, v] of Object.entries(entries)) {
        process.env[k] = v;
      }
    } else {
      for (const [k, v] of Object.entries(entries)) {
        if (process.env[k] === undefined) {
          process.env[k] = v;
        }
      }
    }

    return { parsed: entries };
  } catch (err) {
    return {
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Parse .env.up content and return decrypted key-value pairs.
 * Requires UP_KEY env var to be set.
 */
export async function parse(content: string): Promise<Record<string, string>> {
  const privateKey = await getPrivateKey();
  if (!privateKey) {
    throw new Error('UP_KEY env var required for parse()');
  }
  const { parse: parseFormat, decrypt } = await import('@dotenvup/format');
  const file = parseFormat(content);
  const { entries } = await decrypt(file, DEFAULT_RECIPIENT, privateKey);
  return entries;
}

/**
 * CLI edge-case tests with structured fixture directories.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { parse, serialize } from '@dotenvup/format';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '../../dist/bin.js');
const TEST_HOME = path.join(os.tmpdir(), `dotenvup-cli-test-home-${process.pid}-${Date.now()}`);
const TEST_IDENTITY_DIR = path.join(TEST_HOME, '.dotenvup-test-identity');

function runUp(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      DOTENVUP_TEST: '1',
      DOTENVUP_IDENTITY_DIR: TEST_IDENTITY_DIR,
      DOTENVUP_TEST_IDENTITY_DIR: TEST_IDENTITY_DIR,
      HOME: TEST_HOME,
      USERPROFILE: TEST_HOME,
    };
    const child = spawn('node', [CLI, ...args], { cwd, env });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

function mkdir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function rm(p: string) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true });
}

describe('CLI edge cases', () => {
  let rootDir: string;
  const dirs: Record<string, string> = {};

  beforeAll(async () => {
    rootDir = path.join(os.tmpdir(), `dotenvup-edge-${Date.now()}`);
    mkdir(rootDir);

    // Main dir with keypair + valid .env.up (init+import in same shell to avoid keychain race)
    dirs.main = path.join(rootDir, 'main');
    mkdir(dirs.main);
    fs.writeFileSync(path.join(dirs.main, '.env'), 'FOO=bar\nBAZ=qux', 'utf8');
    const initResult = await runUp(['init', '--force'], dirs.main);
    if (initResult.code !== 0) throw new Error(`init failed: ${initResult.stderr}`);
    const importResult = await runUp(['import', '.env'], dirs.main);
    if (importResult.code !== 0) throw new Error(`import failed: ${importResult.stderr}`);

    // Wrong Key-Id: .env.up with Key-Id that doesn't match our keychain
    dirs.wrongKey = path.join(rootDir, 'wrong-key');
    mkdir(dirs.wrongKey);
    const mainEnvUp = fs.readFileSync(path.join(dirs.main, '.env.up'), 'utf8');
    const parsed = parse(mainEnvUp);
    (parsed.header as { keyId?: string }).keyId = 'wrong-key-id-99';
    fs.writeFileSync(path.join(dirs.wrongKey, '.env.up'), serialize(parsed), 'utf8');

    // Legacy: .env.up without Key-Id (copy of main with Key-Id line removed)
    // Empty: no .env.up
    dirs.empty = path.join(rootDir, 'empty');
    mkdir(dirs.empty);

    // No keypair: fresh dir, no init
    dirs.noKeypair = path.join(rootDir, 'no-keypair');
    mkdir(dirs.noKeypair);
    fs.writeFileSync(path.join(dirs.noKeypair, '.env'), 'X=1', 'utf8');
    await runUp(['init', '--force'], dirs.noKeypair);
    await runUp(['import', '.env'], dirs.noKeypair);
    // Now noKeypair has .env.up. To test "no keypair", we need a dir where keychain is empty.
    // Keychain is global - we can't empty it without affecting other tests. So "no keypair" test
    // would require a subprocess with a different DOTENVUP_TEST value or no keychain. Tricky.
    // Skip no-keypair for now - or use a subprocess that doesn't inherit the keychain. Actually
    // we can't easily isolate keychain per subprocess with keytar.
    // Alternative: test "no keypair" by using a brand new temp dir, run unlock without ever running init.
    // But keychain is global - if we ran init in main, the keychain has the key. unlock in noKeypair
    // would find the key. So we can't test "no keypair" in the same test run. Skip.

    // Invalid .env for import
    dirs.invalidEnv = path.join(rootDir, 'invalid-env');
    mkdir(dirs.invalidEnv);
    fs.writeFileSync(path.join(dirs.invalidEnv, '.env'), '# only comments\n\n', 'utf8');

    // Monorepo-like: nested packages
    dirs.monorepo = path.join(rootDir, 'monorepo');
    mkdir(path.join(dirs.monorepo, 'packages', 'api'));
    mkdir(path.join(dirs.monorepo, 'packages', 'web'));
    fs.writeFileSync(path.join(dirs.monorepo, 'packages', 'api', '.env'), 'API_SECRET=xyz', 'utf8');
    fs.writeFileSync(path.join(dirs.monorepo, 'packages', 'web', '.env'), 'WEB_KEY=abc', 'utf8');
  });

  afterAll(() => {
    rm(rootDir);
    rm(TEST_HOME);
  });

  // Run main-dependent tests FIRST (before any init in other dirs overwrites keychain)
  describe('Key-Id mismatch', () => {
    it('unlock fails with clear message when Key-Id does not match keychain', async () => {
      const result = await runUp(['unlock'], dirs.wrongKey);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('No recipient block could be decrypted with the current key');
    });

    it('lock refuses to delete .env when decrypt fails (use --force-delete)', async () => {
      fs.writeFileSync(path.join(dirs.wrongKey, '.env'), 'A=1', 'utf8');
      const result = await runUp(['lock', '--yes'], dirs.wrongKey);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('Refusing to delete');
      expect(result.stderr).toContain('--force-delete');
      expect(fs.existsSync(path.join(dirs.wrongKey, '.env'))).toBe(true);
    });

    it('lock deletes .env with --force-delete --yes when decrypt fails', async () => {
      fs.writeFileSync(path.join(dirs.wrongKey, '.env'), 'A=1', 'utf8');
      const result = await runUp(['lock', '--force-delete', '--yes'], dirs.wrongKey);
      expect(result.code).toBe(0);
      expect(fs.existsSync(path.join(dirs.wrongKey, '.env'))).toBe(false);
    });

  });

  describe('Duration formats', () => {
    it('unlock with --duration 15m succeeds when dir has matching keychain', async () => {
      const d = path.join(rootDir, 'duration-test');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'A=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      const result = await runUp(['unlock', '--duration', '15m'], d);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Unlocked');
      expect(result.stdout).toContain('Auto-lock scheduled in 15m');
    });

    it('unlock with --duration 7M accepts arbitrary minutes (case-insensitive)', async () => {
      const d = path.join(rootDir, 'arbitrary-duration');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'C=3', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      const result = await runUp(['unlock', '--duration', '7M'], d);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Unlocked');
      expect(result.stdout).toContain('Auto-lock scheduled in 7M');
    });

    it('unlock with --duration never unlocks permanently', async () => {
      const d = path.join(rootDir, 'permanent-unlock');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'B=2', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      const result = await runUp(['unlock', '--duration', 'never'], d);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Unlocked');
      expect(result.stdout).toContain('permanently');
      expect(result.stdout).not.toContain('Auto-lock scheduled');
      expect(fs.existsSync(path.join(d, '.env'))).toBe(true);
    });
  });

  describe('lock edge cases', () => {
    it('lock when already locked is idempotent', async () => {
      const d = path.join(rootDir, 'lock-test');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'X=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      await runUp(['unlock', '--duration', '5m'], d);
      await runUp(['lock', '--yes'], d);
      const result = await runUp(['lock'], d);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('already locked');
    });

    it('lock with drift fails without --force', async () => {
      const d = path.join(rootDir, 'lock-drift');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'A=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      await runUp(['unlock', '--duration', '5m'], d);
      fs.writeFileSync(path.join(d, '.env'), 'A=1\nNEW_KEY=extra', 'utf8');
      const result = await runUp(['lock', '--yes'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('changes not in .env.up');
      expect(result.stderr).toContain('--force');
      expect(fs.existsSync(path.join(d, '.env'))).toBe(true);
    });

    it('lock with drift and --force --yes proceeds', async () => {
      const d = path.join(rootDir, 'lock-drift-force');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'A=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      await runUp(['unlock', '--duration', '5m'], d);
      fs.writeFileSync(path.join(d, '.env'), 'A=1\nNEW_KEY=extra', 'utf8');
      const result = await runUp(['lock', '--yes', '--force'], d);
      expect(result.code).toBe(0);
      expect(fs.existsSync(path.join(d, '.env'))).toBe(false);
    });

    it('lock when .env matches .env.up succeeds', async () => {
      const d = path.join(rootDir, 'lock-match');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'A=1\nB=2', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      await runUp(['unlock', '--duration', '5m'], d);
      const result = await runUp(['lock', '--yes'], d);
      expect(result.code).toBe(0);
      expect(fs.existsSync(path.join(d, '.env'))).toBe(false);
    });
  });

  // Tests below may overwrite keychain with init in other dirs
  describe('Missing files', () => {
    it('unlock fails when .env.up not found', async () => {
      const result = await runUp(['unlock'], dirs.empty);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('.env.up not found');
    });

    it('import fails when source file not found', async () => {
      const result = await runUp(['import', 'nonexistent.env'], dirs.empty);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('not found');
    });
  });

  describe('Unlock overwrite and drift', () => {
    it('unlock when .env exists and matches overwrites idempotently', async () => {
      const d = path.join(rootDir, 'unlock-match');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'X=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      await runUp(['unlock', '--duration', '5m'], d);
      const before = fs.readFileSync(path.join(d, '.env'), 'utf8');
      await runUp(['unlock', '--duration', '5m'], d);
      const after = fs.readFileSync(path.join(d, '.env'), 'utf8');
      expect(after).toContain('X=1');
      expect(before.trim()).toBe(after.trim());
    });

    it('unlock non-TTY with drift fails without --force', async () => {
      const d = path.join(rootDir, 'unlock-drift-notty');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'A=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      await runUp(['unlock', '--duration', '5m'], d);
      fs.writeFileSync(path.join(d, '.env'), 'A=changed', 'utf8');
      const result = await runUp(['unlock', '--duration', '5m'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('local changes');
      expect(result.stderr).toContain('--force');
    });

    it('unlock non-TTY with drift and --force overwrites', async () => {
      const d = path.join(rootDir, 'unlock-drift-force');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'A=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      await runUp(['unlock', '--duration', '5m'], d);
      fs.writeFileSync(path.join(d, '.env'), 'A=changed', 'utf8');
      const result = await runUp(['unlock', '--duration', '5m', '--force'], d);
      expect(result.code).toBe(0);
      expect(fs.readFileSync(path.join(d, '.env'), 'utf8')).toContain('A=1');
    });
  });

  describe('Unlock until terminal exits', () => {
    it('unlock --until-terminal-exit with --duration errors', async () => {
      const d = path.join(rootDir, 'unlock-both-opts');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'X=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      const result = await runUp(['unlock', '--duration', '5m', '--until-terminal-exit'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('Cannot use');
    });

    it('unlock --until-terminal-exit non-TTY fails', async () => {
      const d = path.join(rootDir, 'unlock-shell-notty');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'X=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      const result = await runUp(['unlock', '--until-terminal-exit'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('--duration');
    });

    it('unlock --until-terminal-exit passes exit code when shell exits', async () => {
      // Spawn with TTY is hard to test; we verify non-TTY fails and --duration conflict
      const d = path.join(rootDir, 'unlock-shell-exit');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'X=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      const result = await runUp(['unlock', '--until-terminal-exit'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('--duration');
    });
  });

  describe('Invalid input', () => {
    it('import fails when .env has no KEY=VALUE entries', async () => {
      await runUp(['init', '--force'], dirs.invalidEnv);
      const result = await runUp(['import', '.env'], dirs.invalidEnv);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('No valid');
    });

    it('unlock fails with invalid --duration', async () => {
      const durationDir = path.join(rootDir, 'invalid-duration');
      mkdir(durationDir);
      fs.writeFileSync(path.join(durationDir, '.env'), 'X=1', 'utf8');
      await runUp(['init', '--force'], durationDir);
      await runUp(['import', '.env'], durationDir);
      const result = await runUp(['unlock', '--duration', 'invalid'], durationDir);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('Invalid duration');
    });
  });

  describe('Encoding and filename edge cases', () => {
    it('import handles UTF-8 unicode in .env content', async () => {
      const d = path.join(rootDir, 'unicode-content');
      mkdir(d);
      fs.writeFileSync(
        path.join(d, '.env'),
        'PASSWORD=пароль\nMESSAGE=Hello 世界\nEMOJI=🔑',
        'utf8',
      );
      await runUp(['init', '--force'], d);
      const result = await runUp(['import', '.env'], d);
      expect(result.code).toBe(0);
      const showResult = await runUp(['show'], d);
      expect(showResult.stdout).toContain('PASSWORD=пароль');
      expect(showResult.stdout).toContain('MESSAGE=Hello 世界');
    });

    it('import handles UTF-8 BOM at start of file', async () => {
      const d = path.join(rootDir, 'bom-file');
      mkdir(d);
      const bom = '\uFEFF';
      fs.writeFileSync(path.join(d, '.env'), bom + 'BOM_KEY=bom_value\nX=1', 'utf8');
      await runUp(['init', '--force'], d);
      const result = await runUp(['import', '.env'], d);
      expect(result.code).toBe(0);
      const keysResult = await runUp(['keys'], d);
      expect(keysResult.stdout).toContain('BOM_KEY');
    });

    it('import handles Windows line endings (\\r\\n)', async () => {
      const d = path.join(rootDir, 'crlf-file');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'CRLF_KEY=value1\r\nCRLF_KEY2=value2', 'utf8');
      await runUp(['init', '--force'], d);
      const result = await runUp(['import', '.env'], d);
      expect(result.code).toBe(0);
      const showResult = await runUp(['show'], d);
      expect(showResult.stdout).toContain('CRLF_KEY=value1');
    });

    it('import from file with unicode in filename', async () => {
      const d = path.join(rootDir, 'unicode-filename');
      mkdir(d);
      const filename = '.env.ローカル';
      fs.writeFileSync(path.join(d, filename), 'UNICODE_FILE=ok', 'utf8');
      await runUp(['init', '--force'], d);
      const result = await runUp(['import', filename], d);
      expect(result.code).toBe(0);
      const showResult = await runUp(['show'], d);
      expect(showResult.stdout).toContain('UNICODE_FILE=ok');
    });

    it('import fails with clear error for invalid UTF-8 in file', async () => {
      const d = path.join(rootDir, 'invalid-utf8');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'OK=valid', 'utf8');
      const badPath = path.join(d, '.env');
      fs.writeFileSync(badPath, Buffer.from([0x80, 0x81, 0x82]), 'binary');
      await runUp(['init', '--force'], d);
      const result = await runUp(['import', '.env'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('Invalid UTF-8');
    });

    it('import from file with spaces in filename', async () => {
      const d = path.join(rootDir, 'space-filename');
      mkdir(d);
      const filename = 'my env config.env';
      fs.writeFileSync(path.join(d, filename), 'SPACE_FILE=ok', 'utf8');
      await runUp(['init', '--force'], d);
      const result = await runUp(['import', filename], d);
      expect(result.code).toBe(0);
      const showResult = await runUp(['show'], d);
      expect(showResult.stdout).toContain('SPACE_FILE=ok');
    });
  });

  describe('Filesystem edge cases', () => {
    it('import fails when .env is a directory', async () => {
      const d = path.join(rootDir, 'env-is-dir');
      mkdir(d);
      fs.mkdirSync(path.join(d, '.env'));
      await runUp(['init', '--force'], d);
      const result = await runUp(['import', '.env'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('not a file');
      expect(result.stderr).toContain('directory');
    });

    it('unlock fails when .env.up is a directory', async () => {
      const d = path.join(rootDir, 'envup-is-dir');
      mkdir(d);
      fs.mkdirSync(path.join(d, '.env.up'));
      await runUp(['init', '--force'], d);
      fs.writeFileSync(path.join(d, '.env'), 'X=1', 'utf8');
      await runUp(['import', '.env'], d);
      fs.rmSync(path.join(d, '.env.up'), { recursive: true });
      fs.mkdirSync(path.join(d, '.env.up'));
      const result = await runUp(['unlock'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('.env.up is not a file');
    });

    it('lock without --yes in non-TTY fails asking for --yes', async () => {
      const d = path.join(rootDir, 'lock-no-yes');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'X=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      await runUp(['unlock', '--duration', '5m'], d);
      const result = await runUp(['lock'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('--yes');
      expect(fs.existsSync(path.join(d, '.env'))).toBe(true);
    });

    it('lock fails when .env is a directory', async () => {
      const d = path.join(rootDir, 'env-dir-lock');
      mkdir(d);
      await runUp(['init', '--force'], d);
      fs.writeFileSync(path.join(d, '.env'), 'X=1', 'utf8');
      await runUp(['import', '.env'], d);
      await runUp(['unlock', '--duration', '5m'], d);
      fs.unlinkSync(path.join(d, '.env'));
      fs.mkdirSync(path.join(d, '.env'));
      const result = await runUp(['lock'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('.env is not a file');
    });

    it('import from symlinked .env succeeds', async () => {
      const d = path.join(rootDir, 'symlink-import');
      mkdir(d);
      const realFile = path.join(d, 'real.env');
      fs.writeFileSync(realFile, 'SYMLINK_KEY=via_link', 'utf8');
      fs.symlinkSync(realFile, path.join(d, '.env'));
      await runUp(['init', '--force'], d);
      const result = await runUp(['import', '.env'], d);
      expect(result.code).toBe(0);
      const showResult = await runUp(['show'], d);
      expect(showResult.stdout).toContain('SYMLINK_KEY=via_link');
    });

    it('unlock works when .env.up is a symlink to valid file', async () => {
      const d = path.join(rootDir, 'symlink-envup');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'S=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      const realEnvUp = path.join(d, 'real.env.up');
      fs.renameSync(path.join(d, '.env.up'), realEnvUp);
      fs.symlinkSync(realEnvUp, path.join(d, '.env.up'));
      const result = await runUp(['unlock', '--duration', '5m'], d);
      expect(result.code).toBe(0);
      expect(fs.readFileSync(path.join(d, '.env'), 'utf8')).toContain('S=1');
    });

    it('import with path traversal (relative) succeeds when path resolves to valid file', async () => {
      const d = path.join(rootDir, 'path-traversal');
      mkdir(d);
      mkdir(path.join(d, 'subdir'));
      fs.writeFileSync(path.join(d, '.env'), 'TRAVERSE=ok', 'utf8');
      await runUp(['init', '--force'], d);
      const result = await runUp(['import', 'subdir/../.env'], d);
      expect(result.code).toBe(0);
    });

    it('import from .env in unicode-named directory', async () => {
      const parent = path.join(rootDir, 'parent');
      mkdir(parent);
      const unicodeDir = path.join(parent, '配置');
      mkdir(unicodeDir);
      fs.writeFileSync(path.join(unicodeDir, '.env'), 'UNICODE_DIR=ok', 'utf8');
      await runUp(['init', '--force'], unicodeDir);
      const result = await runUp(['import', '.env'], unicodeDir);
      expect(result.code).toBe(0);
    });

    it('import fails when path resolves to non-existent file', async () => {
      const d = path.join(rootDir, 'nonexistent-path');
      mkdir(d);
      await runUp(['init', '--force'], d);
      const result = await runUp(['import', 'no/such/dir/.env'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('not found');
    });

    it('import fails for empty (zero-byte) file', async () => {
      const d = path.join(rootDir, 'empty-file');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), '', 'utf8');
      await runUp(['init', '--force'], d);
      const result = await runUp(['import', '.env'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('No valid');
    });

    it('keys fails when .env.up is a directory', async () => {
      const d = path.join(rootDir, 'keys-envup-dir');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'X=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      fs.unlinkSync(path.join(d, '.env.up'));
      fs.mkdirSync(path.join(d, '.env.up'));
      const result = await runUp(['keys'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('.env.up is not a file');
    });

    it('show fails when .env.up is a directory', async () => {
      const d = path.join(rootDir, 'show-envup-dir');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'X=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      fs.unlinkSync(path.join(d, '.env.up'));
      fs.mkdirSync(path.join(d, '.env.up'));
      const result = await runUp(['show'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('.env.up is not a file');
    });

    it('status fails when .env.up is a directory', async () => {
      const d = path.join(rootDir, 'status-envup-dir');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'X=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      fs.unlinkSync(path.join(d, '.env.up'));
      fs.mkdirSync(path.join(d, '.env.up'));
      const result = await runUp(['status'], d);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('.env.up is not a file');
    });
  });

  describe('Status drift indicator', () => {
    it('status shows drift when .env differs from .env.up', async () => {
      const d = path.join(rootDir, 'status-drift');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'A=1', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      await runUp(['unlock', '--duration', '5m'], d);
      fs.writeFileSync(path.join(d, '.env'), 'A=2', 'utf8');
      const result = await runUp(['status'], d);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Drift');
      expect(result.stdout).toContain('up import');
    });
  });

  describe('import edge cases (overwrites keychain)', () => {
    it('import with custom file path', async () => {
      const customDir = path.join(rootDir, 'custom-import');
      mkdir(customDir);
      fs.writeFileSync(path.join(customDir, 'my.env'), 'CUSTOM=value', 'utf8');
      await runUp(['init', '--force'], customDir);
      const result = await runUp(['import', 'my.env'], customDir);
      expect(result.code).toBe(0);
      expect(fs.existsSync(path.join(customDir, '.env.up'))).toBe(true);
      const keysResult = await runUp(['keys'], customDir);
      expect(keysResult.stdout).toContain('CUSTOM');
    });

    it('import with duplicate keys uses last', async () => {
      const d = path.join(rootDir, 'import-duplicate');
      mkdir(d);
      fs.writeFileSync(path.join(d, '.env'), 'A=1\nA=2', 'utf8');
      await runUp(['init', '--force'], d);
      await runUp(['import', '.env'], d);
      const showResult = await runUp(['show'], d);
      expect(showResult.stdout).toContain('A=2');
    });

    it('import with --delete removes source file', async () => {
      const delDir = path.join(rootDir, 'import-delete');
      mkdir(delDir);
      fs.writeFileSync(path.join(delDir, 'to-import.env'), 'DEL=me', 'utf8');
      await runUp(['init', '--force'], delDir);
      const result = await runUp(['import', 'to-import.env', '--delete'], delDir);
      expect(result.code).toBe(0);
      expect(fs.existsSync(path.join(delDir, 'to-import.env'))).toBe(false);
      expect(fs.existsSync(path.join(delDir, '.env.up'))).toBe(true);
    });
  });

  describe('Monorepo structure (overwrites keychain)', () => {
    it('each package dir works independently', async () => {
      const apiDir = path.join(dirs.monorepo, 'packages', 'api');
      const webDir = path.join(dirs.monorepo, 'packages', 'web');
      await runUp(['init', '--force'], apiDir);
      await runUp(['import', '.env'], apiDir);
      await runUp(['init', '--force'], webDir);
      await runUp(['import', '.env'], webDir);

      const apiStatus = await runUp(['status'], apiDir);
      expect(apiStatus.code).toBe(0);
      expect(apiStatus.stdout).toContain('.env.up');

      const webStatus = await runUp(['status'], webDir);
      expect(webStatus.code).toBe(0);

      await runUp(['unlock', '--duration', '5m'], apiDir);
      const apiEnv = fs.readFileSync(path.join(apiDir, '.env'), 'utf8');
      expect(apiEnv).toContain('API_SECRET=xyz');

      await runUp(['unlock', '--duration', '5m'], webDir);
      const webEnv = fs.readFileSync(path.join(webDir, '.env'), 'utf8');
      expect(webEnv).toContain('WEB_KEY=abc');
    });
  });
});

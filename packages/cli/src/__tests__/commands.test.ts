import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

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

describe('CLI commands', () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), `dotenvup-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, '.env'), 'DB_HOST=localhost\nDB_PASSWORD=secret\nAPI_KEY=key', 'utf8');
  });

  afterAll(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  it('init creates keypair', async () => {
    const result = await runUp(['init', '--force'], testDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DotEnvUp keypair created');
    expect(result.stdout).toContain('Recipient ID: @local');
  });

  it('import converts .env to .env.up', async () => {
    const result = await runUp(['import', '.env'], testDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Imported 3 keys');
    expect(fs.existsSync(path.join(testDir, '.env.up'))).toBe(true);
  });

  it('keys lists metadata without decryption', async () => {
    const result = await runUp(['keys'], testDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DB_HOST');
    expect(result.stdout).toContain('DB_PASSWORD');
    expect(result.stdout).toContain('API_KEY');
  });

  it('lock removes .env', async () => {
    const result = await runUp(['lock', '--yes'], testDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Locked');
    expect(fs.existsSync(path.join(testDir, '.env'))).toBe(false);
  });

  it('unlock recreates .env', async () => {
    const result = await runUp(['unlock'], testDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Unlocked');
    expect(fs.existsSync(path.join(testDir, '.env'))).toBe(true);
    const content = fs.readFileSync(path.join(testDir, '.env'), 'utf8');
    expect(content).toContain('DB_HOST=localhost');
    expect(content).toContain('DB_PASSWORD=secret');
  });

  it('show prints decrypted values', async () => {
    const result = await runUp(['show'], testDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DB_HOST=localhost');
  });

  it('show KEY prints single value', async () => {
    const result = await runUp(['show', 'DB_HOST'], testDir);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('localhost');
  });

  it('status shows lock state', async () => {
    const result = await runUp(['status'], testDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('UNLOCKED');
    expect(result.stdout).toContain('Keypair: configured');
  });

  it('--help shows usage', async () => {
    const result = await runUp(['--help'], testDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage');
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('import');
  });

  it('--version shows version', async () => {
    const result = await runUp(['--version'], testDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('0.2.1');
  });

  it('session status works when cold', async () => {
    const sessDir = path.join(TEST_HOME, 'session-test');
    fs.mkdirSync(sessDir, { recursive: true });
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
      const env = {
        ...process.env,
        DOTENVUP_TEST: '1',
        DOTENVUP_IDENTITY_DIR: TEST_IDENTITY_DIR,
        DOTENVUP_TEST_IDENTITY_DIR: TEST_IDENTITY_DIR,
        HOME: TEST_HOME,
        USERPROFILE: TEST_HOME,
        DOTENVUP_SESSION_SOCK: path.join(sessDir, 'agent.sock'),
        DOTENVUP_SESSION_COOKIE: path.join(sessDir, 'agent.cookie'),
        DOTENVUP_NO_PRESENCE: '1',
      };
      const child = spawn('node', [CLI, 'session', 'status', '--json'], { cwd: testDir, env });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => { stdout += d.toString(); });
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    });
    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.active).toBe(false);
  });

  it('status --json includes sessionActive', async () => {
    const result = await runUp(['status', '--json'], testDir);
    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(typeof json.sessionActive).toBe('boolean');
    expect(json.keyStorage).toBeTruthy();
  });

  it('--help mentions session', async () => {
    const result = await runUp(['--help'], testDir);
    expect(result.stdout).toContain('session status');
    expect(result.stdout).toContain('migrate-to-keychain');
  });
});

describe('CLI error cases', () => {
  let emptyDir: string;

  beforeAll(() => {
    emptyDir = path.join(os.tmpdir(), `dotenvup-empty-${Date.now()}`);
    fs.mkdirSync(emptyDir, { recursive: true });
  });

  afterAll(() => {
    if (emptyDir && fs.existsSync(emptyDir)) {
      fs.rmSync(emptyDir, { recursive: true });
    }
  });

  it('unlock without .env.up fails', async () => {
    const result = await runUp(['unlock'], emptyDir);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('.env.up not found');
  });

  it('unknown command fails', async () => {
    const result = await runUp(['unknowncmd'], emptyDir);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Unknown command');
  });
});

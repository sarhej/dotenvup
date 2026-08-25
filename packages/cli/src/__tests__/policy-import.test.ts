/**
 * CLI: merge import, verify, init when keypair already exists
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { parse } from '@dotenvup/format';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '../../dist/bin.js');

function runUp(
  args: string[],
  cwd: string,
  identityDir: string,
  home: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      DOTENVUP_TEST: '1',
      DOTENVUP_NO_PROMPT: '1',
      DOTENVUP_IDENTITY_DIR: identityDir,
      DOTENVUP_TEST_IDENTITY_DIR: identityDir,
      HOME: home,
      USERPROFILE: home,
    };
    const child = spawn('node', [CLI, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin?.end();
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

describe('policy CLI flows', () => {
  const root = path.join(os.tmpdir(), `dotenvup-policy-cli-${Date.now()}`);
  const home = path.join(root, 'home');
  const identityDir = path.join(home, '.dotenvup-test-identity');
  const projectDir = path.join(root, 'project');

  beforeAll(async () => {
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.env'), 'A=one\nB=two\n', 'utf8');
    const init = await runUp(['init', '--yes'], projectDir, identityDir, home);
    if (init.code !== 0) throw new Error(`init failed: ${init.stderr}`);
  });

  afterAll(() => {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('init refuses when keypair already exists (no --force)', async () => {
    const result = await runUp(['init'], projectDir, identityDir, home);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/already exists/i);
  });

  it('first import creates .env.up', async () => {
    const result = await runUp(['import', '.env'], projectDir, identityDir, home);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Imported 2 keys');
    expect(fs.existsSync(path.join(projectDir, '.env.up'))).toBe(true);
  });

  it('second import merges when .env.up exists', async () => {
    fs.writeFileSync(path.join(projectDir, '.env'), 'A=updated\nB=two\n', 'utf8');
    const result = await runUp(['import', '.env'], projectDir, identityDir, home);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Merged import/);
    const content = fs.readFileSync(path.join(projectDir, '.env.up'), 'utf8');
    const file = parse(content);
    expect(file.header.keys.find((k) => k.name === 'A')?.version).toBeGreaterThan(1);
  });

  it('verify passes on file without policy', async () => {
    const result = await runUp(['verify'], projectDir, identityDir, home);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/checks passed/i);
  });

  it('verify --json does not print secret values', async () => {
    const result = await runUp(['verify', '--json'], projectDir, identityDir, home);
    expect(result.code).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.ok).toBe(true);
    expect(result.stdout).not.toContain('updated');
    expect(result.stdout).not.toContain('one');
  });

  it('verify fails on invalid policy (P1) without leaking values', async () => {
    const envUp = fs.readFileSync(path.join(projectDir, '.env.up'), 'utf8');
    const broken = envUp.replace(
      '[keys]',
      `[policy]
version: 1
recipient:@local  keys:NOT_IN_CATALOG

[keys]`,
    );
    fs.writeFileSync(path.join(projectDir, '.env.up'), broken, 'utf8');
    const result = await runUp(['verify', '--json'], projectDir, identityDir, home);
    expect(result.code).toBe(1);
    const json = JSON.parse(result.stdout);
    expect(json.ok).toBe(false);
    expect(json.errors.some((e: { code: string }) => e.code === 'P1')).toBe(true);
    expect(result.stdout).not.toContain('updated');
  });

  it('MRG-06: recipients remove updates [policy] and drops encrypted block', async () => {
    const mrgDir = path.join(root, 'mrg06-project');
    const bobHome = path.join(root, 'bob-home-mrg06');
    const bobIdentity = path.join(bobHome, '.dotenvup-test-identity');
    fs.mkdirSync(mrgDir, { recursive: true });
    fs.mkdirSync(bobHome, { recursive: true });
    fs.writeFileSync(path.join(mrgDir, '.env'), 'A=one\nB=two\n', 'utf8');

    const bobInit = await runUp(['init', '--yes'], mrgDir, bobIdentity, bobHome);
    expect(bobInit.code).toBe(0);

    const bobPubPath = path.join(bobIdentity, 'identity.pub');
    const addBob = await runUp(
      ['recipients', 'add', bobPubPath, '--label', 'bob'],
      mrgDir,
      identityDir,
      home,
    );
    expect(addBob.code).toBe(0);

    const {
      KeyStore,
      parse: parseFile,
      serialize,
      create,
      resolveRecipientPublicKeys,
    } = await import('@dotenvup/format');

    process.env.DOTENVUP_IDENTITY_DIR = identityDir;
    process.env.DOTENVUP_TEST_IDENTITY_DIR = identityDir;
    const store = new KeyStore();
    const publicKey = await store.getPublicKey();
    if (!publicKey) throw new Error('alice keypair missing');

    const recipientKeys = await resolveRecipientPublicKeys(mrgDir, publicKey);
    const file = await create(
      { A: 'one', B: 'two' },
      '@local',
      recipientKeys,
      'A=one\nB=two\n',
      {
        version: 1,
        rows: [
          { recipient: '@local', keys: ['A', 'B'] },
          { recipient: 'bob', keys: ['A', 'B'] },
        ],
      },
    );
    const envUpPath = path.join(mrgDir, '.env.up');
    fs.writeFileSync(envUpPath, serialize(file), 'utf8');
    expect(file.encryptedBlocks.some((b) => b.recipient === 'bob')).toBe(true);

    const remove = await runUp(['recipients', 'remove', 'bob'], mrgDir, identityDir, home);
    expect(remove.code).toBe(0);
    expect(remove.stdout + remove.stderr).toMatch(/\[policy\]/i);

    const after = parseFile(fs.readFileSync(envUpPath, 'utf8'));
    expect(after.policy?.rows.some((r) => r.recipient === 'bob')).toBe(false);
    expect(after.encryptedBlocks.some((b) => b.recipient === 'bob')).toBe(false);
    expect(after.encryptedBlocks.length).toBe(1);
  });

  it('reencrypt refuses partial-slice holder', async () => {
    const partialDir = path.join(root, 'partial-reencrypt');
    const bobHome = path.join(root, 'bob-home-reencrypt');
    const bobIdentity = path.join(bobHome, '.dotenvup-test-identity');
    fs.mkdirSync(partialDir, { recursive: true });
    fs.mkdirSync(bobHome, { recursive: true });

    const bobInit = await runUp(['init', '--yes'], partialDir, bobIdentity, bobHome);
    expect(bobInit.code).toBe(0);

    const bobPubPath = path.join(bobIdentity, 'identity.pub');
    const addBob = await runUp(
      ['recipients', 'add', bobPubPath, '--label', 'bob'],
      partialDir,
      identityDir,
      home,
    );
    expect(addBob.code).toBe(0);

    const {
      KeyStore,
      serialize,
      create,
      resolveRecipientPublicKeys,
    } = await import('@dotenvup/format');

    process.env.DOTENVUP_IDENTITY_DIR = identityDir;
    process.env.DOTENVUP_TEST_IDENTITY_DIR = identityDir;
    const store = new KeyStore();
    const publicKey = await store.getPublicKey();
    if (!publicKey) throw new Error('alice keypair missing');

    const recipientKeys = await resolveRecipientPublicKeys(partialDir, publicKey);
    const file = await create(
      { A: 'one', B: 'two' },
      '@local',
      recipientKeys,
      'A=one\nB=two\n',
      {
        version: 1,
        rows: [
          { recipient: '@local', keys: ['A', 'B'] },
          { recipient: 'bob', keys: ['A'] },
        ],
      },
    );
    fs.writeFileSync(path.join(partialDir, '.env.up'), serialize(file), 'utf8');

    const refuse = await runUp(['reencrypt'], partialDir, bobIdentity, bobHome);
    expect(refuse.code).toBe(1);
    expect(refuse.stderr + refuse.stdout).toMatch(/full-catalog|missing catalog/i);
  });
});

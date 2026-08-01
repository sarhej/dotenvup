import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ensureSessionAgent,
  sessionGet,
  sessionPut,
  sessionStatus,
  sessionStop,
  parseDurationMs,
  generateKeypair,
  keyFingerprint,
} from '../index.js';

describe('parseDurationMs', () => {
  it('parses units', () => {
    expect(parseDurationMs('30m', 0)).toBe(30 * 60 * 1000);
    expect(parseDurationMs('8h', 0)).toBe(8 * 60 * 60 * 1000);
    expect(parseDurationMs('90s', 0)).toBe(90_000);
    expect(parseDurationMs('500', 0)).toBe(500);
  });
});

describe('session agent process', () => {
  let tmp: string;
  let child: ChildProcess | null = null;
  let prevSock: string | undefined;
  let prevCookie: string | undefined;
  let prevPresence: string | undefined;
  let prevIdle: string | undefined;
  let prevAbs: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenvup-sess-'));
    prevSock = process.env.DOTENVUP_SESSION_SOCK;
    prevCookie = process.env.DOTENVUP_SESSION_COOKIE;
    prevPresence = process.env.DOTENVUP_NO_PRESENCE;
    prevIdle = process.env.DOTENVUP_SESSION_IDLE_TTL;
    prevAbs = process.env.DOTENVUP_SESSION_ABSOLUTE_TTL;
    process.env.DOTENVUP_SESSION_SOCK = path.join(tmp, 'agent.sock');
    process.env.DOTENVUP_SESSION_COOKIE = path.join(tmp, 'agent.cookie');
    process.env.DOTENVUP_NO_PRESENCE = '1';
    process.env.DOTENVUP_SESSION_IDLE_TTL = '5s';
    process.env.DOTENVUP_SESSION_ABSOLUTE_TTL = '30s';
  });

  afterEach(async () => {
    await sessionStop().catch(() => undefined);
    if (child && !child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    child = null;
    if (prevSock === undefined) delete process.env.DOTENVUP_SESSION_SOCK;
    else process.env.DOTENVUP_SESSION_SOCK = prevSock;
    if (prevCookie === undefined) delete process.env.DOTENVUP_SESSION_COOKIE;
    else process.env.DOTENVUP_SESSION_COOKIE = prevCookie;
    if (prevPresence === undefined) delete process.env.DOTENVUP_NO_PRESENCE;
    else process.env.DOTENVUP_NO_PRESENCE = prevPresence;
    if (prevIdle === undefined) delete process.env.DOTENVUP_SESSION_IDLE_TTL;
    else process.env.DOTENVUP_SESSION_IDLE_TTL = prevIdle;
    if (prevAbs === undefined) delete process.env.DOTENVUP_SESSION_ABSOLUTE_TTL;
    else process.env.DOTENVUP_SESSION_ABSOLUTE_TTL = prevAbs;
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('put/get/status/stop round-trip', async () => {
    const main = path.join(path.dirname(fileURLToPath(import.meta.url)), '../sessionAgentMain.js');
    // Prefer dist path when tests run from src via vitest transform
    const distMain = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/sessionAgentMain.js');
    const entry = fs.existsSync(distMain) ? distMain : main;
    expect(fs.existsSync(entry)).toBe(true);

    const ready = await ensureSessionAgent();
    expect(ready).toBe(true);

    const kp = await generateKeypair();
    const keyId = await keyFingerprint(kp.publicKey);
    expect(await sessionPut(keyId, kp)).toBe(true);

    const st = await sessionStatus();
    expect(st.active).toBe(true);
    expect(st.keyId).toBe(keyId);

    const got = await sessionGet(keyId);
    expect(got).not.toBeNull();
    expect(Buffer.from(got!.privateKey).equals(Buffer.from(kp.privateKey))).toBe(true);

    expect(await sessionStop()).toBe(true);
    const st2 = await sessionStatus();
    expect(st2.active).toBe(false);
  });

  it('idle TTL clears the key', async () => {
    await sessionStop().catch(() => undefined);
    // Wait until previous agent socket is gone so a fresh agent reads new TTLs.
    const sock = process.env.DOTENVUP_SESSION_SOCK!;
    for (let i = 0; i < 40 && fs.existsSync(sock); i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    process.env.DOTENVUP_SESSION_IDLE_TTL = '150ms';
    process.env.DOTENVUP_SESSION_ABSOLUTE_TTL = '10s';
    expect(await ensureSessionAgent()).toBe(true);
    const kp = await generateKeypair();
    const keyId = await keyFingerprint(kp.publicKey);
    expect(await sessionPut(keyId, kp)).toBe(true);
    await new Promise((r) => setTimeout(r, 400));
    const got = await sessionGet(keyId);
    expect(got).toBeNull();
  });
});

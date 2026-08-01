/**
 * Session agent edge cases (M3) — runs on Linux + macOS CI.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as net from 'node:net';
import {
  ensureSessionAgent,
  sessionGet,
  sessionPut,
  sessionStatus,
  sessionStop,
  sessionSocketPath,
  sessionRequestForTests,
  generateKeypair,
  keyFingerprint,
} from '../index.js';

describe('session agent edge cases', () => {
  let tmp: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenvup-sess-edge-'));
    for (const k of [
      'DOTENVUP_SESSION_SOCK',
      'DOTENVUP_SESSION_COOKIE',
      'DOTENVUP_NO_PRESENCE',
      'DOTENVUP_SESSION_IDLE_TTL',
      'DOTENVUP_SESSION_ABSOLUTE_TTL',
      'DOTENVUP_NO_SESSION',
    ]) {
      saved[k] = process.env[k];
    }
    process.env.DOTENVUP_SESSION_SOCK = path.join(tmp, 'agent.sock');
    process.env.DOTENVUP_SESSION_COOKIE = path.join(tmp, 'agent.cookie');
    process.env.DOTENVUP_NO_PRESENCE = '1';
    process.env.DOTENVUP_SESSION_IDLE_TTL = '30s';
    process.env.DOTENVUP_SESSION_ABSOLUTE_TTL = '60s';
    delete process.env.DOTENVUP_NO_SESSION;
  });

  afterEach(async () => {
    await sessionStop().catch(() => undefined);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('rejects get for mismatched keyId', async () => {
    expect(await ensureSessionAgent()).toBe(true);
    const kp = await generateKeypair();
    const keyId = await keyFingerprint(kp.publicKey);
    expect(await sessionPut(keyId, kp)).toBe(true);
    expect(await sessionGet('not-the-right-key-id')).toBeNull();
    expect(await sessionGet(keyId)).not.toBeNull();
  });

  it('rejects requests with bad cookie token', async () => {
    expect(await ensureSessionAgent()).toBe(true);
    const res = await sessionRequestForTests({ op: 'ping', token: 'definitely-wrong-token' });
    expect(res).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('respawns after stale socket (dead listener)', async () => {
    expect(await ensureSessionAgent()).toBe(true);
    const kp = await generateKeypair();
    const keyId = await keyFingerprint(kp.publicKey);
    expect(await sessionPut(keyId, kp)).toBe(true);

    // Kill agent hard, leave a dead socket path behind.
    await sessionStop();
    await new Promise((r) => setTimeout(r, 100));

    // Create a leftover socket file that does not accept connections.
    const sock = sessionSocketPath();
    fs.writeFileSync(sock, '', { mode: 0o600 });

    expect(await ensureSessionAgent()).toBe(true);
    // Fresh agent is empty.
    expect(await sessionGet(keyId)).toBeNull();
    expect(await sessionPut(keyId, kp)).toBe(true);
    expect(await sessionGet(keyId)).not.toBeNull();
  });

  it('clears key on absolute TTL', async () => {
    await sessionStop().catch(() => undefined);
    const sock = process.env.DOTENVUP_SESSION_SOCK!;
    for (let i = 0; i < 40 && fs.existsSync(sock); i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    process.env.DOTENVUP_SESSION_IDLE_TTL = '30s';
    process.env.DOTENVUP_SESSION_ABSOLUTE_TTL = '250ms';
    expect(await ensureSessionAgent()).toBe(true);
    const kp = await generateKeypair();
    const keyId = await keyFingerprint(kp.publicKey);
    expect(await sessionPut(keyId, kp)).toBe(true);
    await new Promise((r) => setTimeout(r, 600));
    // Absolute TTL shuts the agent down entirely.
    const st = await sessionStatus();
    expect(st.active).toBe(false);
    expect(await sessionGet(keyId)).toBeNull();
  });

  it('DOTENVUP_NO_SESSION disables put/get', async () => {
    process.env.DOTENVUP_NO_SESSION = '1';
    const kp = await generateKeypair();
    const keyId = await keyFingerprint(kp.publicKey);
    expect(await sessionPut(keyId, kp)).toBe(false);
    expect(await sessionGet(keyId)).toBeNull();
  });

  it('does not treat a listening but closed server as warm without cookie', async () => {
    // Bind a dummy server on the socket path with no cookie → ensureSessionAgent should replace.
    const sock = sessionSocketPath();
    await new Promise<void>((resolve, reject) => {
      const s = net.createServer();
      s.listen(sock, () => {
        s.close(() => resolve());
      });
      s.on('error', reject);
    });
    expect(await ensureSessionAgent()).toBe(true);
    const st = await sessionStatus();
    expect(st.active).toBe(false);
  });
});

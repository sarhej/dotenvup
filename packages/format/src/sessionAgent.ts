/**
 * DotEnvUp session agent — in-memory private-key cache over a local Unix socket.
 *
 * Same-UID trust model (like ssh-agent). Socket + cookie are mode 0600.
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Keypair } from './keyProvider.js';

const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const DEFAULT_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const MAX_ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export interface SessionStatus {
  active: boolean;
  keyId: string | null;
  idleMsLeft: number | null;
  absoluteMsLeft: number | null;
  socketPath: string;
}

type AgentRequest =
  | { op: 'ping'; token: string }
  | { op: 'status'; token: string }
  | { op: 'get'; token: string }
  | { op: 'put'; token: string; keyId: string; publicKey: string; privateKey: string }
  | { op: 'stop'; token: string }
  | { op: 'wipe'; token: string; reason?: string };

type AgentResponse =
  | { ok: true; op: 'ping' }
  | { ok: true; op: 'status'; active: boolean; keyId: string | null; idleMsLeft: number | null; absoluteMsLeft: number | null }
  | { ok: true; op: 'get'; keyId: string; publicKey: string; privateKey: string }
  | { ok: true; op: 'put'; keyId: string }
  | { ok: true; op: 'stop' }
  | { ok: true; op: 'wipe' }
  | { ok: false; error: string };

function uid(): number {
  return typeof process.getuid === 'function' ? process.getuid() : 0;
}

export function sessionSocketPath(): string {
  const override = process.env.DOTENVUP_SESSION_SOCK?.trim();
  if (override) return override;
  return path.join(os.tmpdir(), `dotenvup-agent-${uid()}.sock`);
}

export function sessionCookiePath(): string {
  const override = process.env.DOTENVUP_SESSION_COOKIE?.trim();
  if (override) return override;
  return path.join(os.tmpdir(), `dotenvup-agent-${uid()}.cookie`);
}

/** Parse 30m / 8h / 90s / bare ms number. */
export function parseDurationMs(input: string | undefined, fallback: number): number {
  if (!input || !input.trim()) return fallback;
  const s = input.trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(s);
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = m[2] ?? 'ms';
  switch (unit) {
    case 'ms':
      return Math.floor(n);
    case 's':
      return Math.floor(n * 1000);
    case 'm':
      return Math.floor(n * 60 * 1000);
    case 'h':
      return Math.floor(n * 60 * 60 * 1000);
    default:
      return fallback;
  }
}

export function sessionTtls(): { idleMs: number; absoluteMs: number } {
  const both = process.env.DOTENVUP_SESSION_TTL?.trim();
  let idleMs = parseDurationMs(process.env.DOTENVUP_SESSION_IDLE_TTL, DEFAULT_IDLE_MS);
  let absoluteMs = parseDurationMs(process.env.DOTENVUP_SESSION_ABSOLUTE_TTL, DEFAULT_ABSOLUTE_MS);
  if (both) {
    const v = parseDurationMs(both, DEFAULT_ABSOLUTE_MS);
    idleMs = Math.min(idleMs, v);
    absoluteMs = v;
  }
  // Floor 100ms so tests can use short TTLs; defaults remain 30m / 8h.
  absoluteMs = Math.min(Math.max(absoluteMs, 100), MAX_ABSOLUTE_MS);
  idleMs = Math.min(Math.max(idleMs, 100), absoluteMs);
  return { idleMs, absoluteMs };
}

function readCookie(): string | null {
  try {
    const raw = fs.readFileSync(sessionCookiePath(), 'utf8').trim();
    return raw.length >= 16 ? raw : null;
  } catch {
    return null;
  }
}

function request(req: AgentRequest, timeoutMs = 1500): Promise<AgentResponse | null> {
  const sockPath = sessionSocketPath();
  if (!fs.existsSync(sockPath)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const socket = net.createConnection(sockPath);
    let buf = '';
    let done = false;
    const finish = (value: AgentResponse | null) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    socket.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        clearTimeout(timer);
        try {
          finish(JSON.parse(buf.slice(0, nl)) as AgentResponse);
        } catch {
          finish(null);
        }
      }
    });
    socket.on('connect', () => {
      socket.write(JSON.stringify(req) + '\n');
    });
  });
}

function agentMainPath(): string {
  const fromEnv = process.env.DOTENVUP_SESSION_AGENT_MAIN?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  // import.meta.url is empty when this module is bundled into CJS (VS Code extension).
  let here = '';
  try {
    const u = import.meta.url;
    if (typeof u === 'string' && u.length > 0) {
      here = path.dirname(fileURLToPath(u));
    }
  } catch {
    // ignore
  }

  const candidates = [
    here ? path.join(here, 'sessionAgentMain.js') : '',
    here ? path.resolve(here, '../dist/sessionAgentMain.js') : '',
    here ? path.resolve(here, '../../dist/sessionAgentMain.js') : '',
    // Monorepo / global CLI install fallbacks
    path.resolve(process.cwd(), 'node_modules/@dotenvup/format/dist/sessionAgentMain.js'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0] ?? 'sessionAgentMain.js';
}

/** Spawn detached agent if not already running. */
export async function ensureSessionAgent(): Promise<boolean> {
  const token = readCookie();
  if (token) {
    const ping = await request({ op: 'ping', token });
    if (ping?.ok) return true;
  }

  // Stale socket / dead agent: clear so a new process can bind.
  const sock = sessionSocketPath();
  try {
    if (fs.existsSync(sock)) fs.unlinkSync(sock);
  } catch {
    // ignore
  }
  try {
    if (fs.existsSync(sessionCookiePath())) fs.unlinkSync(sessionCookiePath());
  } catch {
    // ignore
  }

  const main = agentMainPath();
  if (!fs.existsSync(main)) return false;

  const child = spawn(process.execPath, [main], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const t = readCookie();
    if (!t) continue;
    const ping = await request({ op: 'ping', token: t });
    if (ping?.ok) return true;
  }
  return false;
}

export async function sessionStatus(): Promise<SessionStatus> {
  const socketPath = sessionSocketPath();
  const token = readCookie();
  if (!token) {
    return { active: false, keyId: null, idleMsLeft: null, absoluteMsLeft: null, socketPath };
  }
  const res = await request({ op: 'status', token });
  if (!res || !res.ok || res.op !== 'status') {
    return { active: false, keyId: null, idleMsLeft: null, absoluteMsLeft: null, socketPath };
  }
  return {
    active: res.active,
    keyId: res.keyId,
    idleMsLeft: res.idleMsLeft,
    absoluteMsLeft: res.absoluteMsLeft,
    socketPath,
  };
}

function sessionDisabled(): boolean {
  return process.env.DOTENVUP_NO_SESSION === '1';
}

export async function sessionGet(expectedKeyId?: string): Promise<Keypair | null> {
  if (sessionDisabled()) return null;
  const token = readCookie();
  if (!token) return null;
  const res = await request({ op: 'get', token });
  if (!res || !res.ok || res.op !== 'get') return null;
  if (expectedKeyId && res.keyId !== expectedKeyId) return null;
  const publicKey = new Uint8Array(Buffer.from(res.publicKey, 'base64'));
  const privateKey = new Uint8Array(Buffer.from(res.privateKey, 'base64'));
  if (publicKey.length !== 32 || privateKey.length !== 32) return null;
  return { publicKey, privateKey };
}

export async function sessionPut(keyId: string, keypair: Keypair): Promise<boolean> {
  if (sessionDisabled()) return false;
  const ready = await ensureSessionAgent();
  if (!ready) return false;
  const token = readCookie();
  if (!token) return false;
  const res = await request({
    op: 'put',
    token,
    keyId,
    publicKey: Buffer.from(keypair.publicKey).toString('base64'),
    privateKey: Buffer.from(keypair.privateKey).toString('base64'),
  });
  return !!res?.ok && res.op === 'put';
}

export async function sessionStop(): Promise<boolean> {
  const token = readCookie();
  if (!token) return false;
  const res = await request({ op: 'stop', token });
  return !!res?.ok;
}

/** Test helper: talk to a custom socket (used by unit tests with in-process server). */
export async function sessionRequestForTests(req: AgentRequest): Promise<AgentResponse | null> {
  return request(req);
}

export type { AgentRequest, AgentResponse };

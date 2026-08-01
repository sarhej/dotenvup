/**
 * Detached session agent process entrypoint.
 * Run: node dist/sessionAgentMain.js
 */

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  sessionCookiePath,
  sessionSocketPath,
  sessionTtls,
  type AgentRequest,
  type AgentResponse,
} from './sessionAgent.js';

interface HeldKey {
  keyId: string;
  publicKey: string;
  privateKey: string;
}

const sockPath = sessionSocketPath();
const cookiePath = sessionCookiePath();
const { idleMs, absoluteMs } = sessionTtls();

let held: HeldKey | null = null;
let lastUsedAt = 0;
let createdAt = 0;
let idleTimer: NodeJS.Timeout | null = null;
let absoluteTimer: NodeJS.Timeout | null = null;
let presenceChild: ChildProcess | null = null;
let shuttingDown = false;
let cookie = '';

function writeAtomic(filePath: string, data: string, mode: number): void {
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data, { mode });
  fs.renameSync(tmp, filePath);
  fs.chmodSync(filePath, mode);
}

function clearKey(reason: string): void {
  held = null;
  lastUsedAt = 0;
  createdAt = 0;
  if (idleTimer) clearTimeout(idleTimer);
  if (absoluteTimer) clearTimeout(absoluteTimer);
  idleTimer = null;
  absoluteTimer = null;
  if (process.env.DOTENVUP_DEBUG === '1') {
    process.stderr.write(`[dotenvup-agent] wiped: ${reason}\n`);
  }
}

function armTimers(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (absoluteTimer) clearTimeout(absoluteTimer);
  idleTimer = setTimeout(() => {
    clearKey('idle');
  }, idleMs);
  const absLeft = Math.max(1, createdAt + absoluteMs - Date.now());
  absoluteTimer = setTimeout(() => {
    clearKey('absolute');
    shutdown('absolute');
  }, absLeft);
}

function msLeft(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function respond(socket: net.Socket, res: AgentResponse): void {
  socket.write(JSON.stringify(res) + '\n');
  socket.end();
}

function handle(req: AgentRequest): AgentResponse {
  if (!req || typeof req !== 'object' || !('op' in req)) {
    return { ok: false, error: 'invalid request' };
  }
  if (req.token !== cookie) {
    return { ok: false, error: 'unauthorized' };
  }

  switch (req.op) {
    case 'ping':
      return { ok: true, op: 'ping' };
    case 'status': {
      if (!held) {
        return {
          ok: true,
          op: 'status',
          active: false,
          keyId: null,
          idleMsLeft: null,
          absoluteMsLeft: null,
        };
      }
      return {
        ok: true,
        op: 'status',
        active: true,
        keyId: held.keyId,
        idleMsLeft: msLeft(lastUsedAt + idleMs),
        absoluteMsLeft: msLeft(createdAt + absoluteMs),
      };
    }
    case 'get': {
      if (!held) return { ok: false, error: 'session empty' };
      lastUsedAt = Date.now();
      armTimers();
      return {
        ok: true,
        op: 'get',
        keyId: held.keyId,
        publicKey: held.publicKey,
        privateKey: held.privateKey,
      };
    }
    case 'put': {
      if (!req.keyId || !req.publicKey || !req.privateKey) {
        return { ok: false, error: 'missing key material' };
      }
      const pub = Buffer.from(req.publicKey, 'base64');
      const priv = Buffer.from(req.privateKey, 'base64');
      if (pub.length !== 32 || priv.length !== 32) {
        return { ok: false, error: 'invalid key length' };
      }
      held = {
        keyId: req.keyId,
        publicKey: req.publicKey,
        privateKey: req.privateKey,
      };
      createdAt = Date.now();
      lastUsedAt = createdAt;
      armTimers();
      return { ok: true, op: 'put', keyId: held.keyId };
    }
    case 'wipe':
      clearKey(req.reason ?? 'wipe');
      return { ok: true, op: 'wipe' };
    case 'stop':
      clearKey('stop');
      setImmediate(() => shutdown('stop'));
      return { ok: true, op: 'stop' };
    default:
      return { ok: false, error: 'unknown op' };
  }
}

function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  clearKey(reason);
  try {
    presenceChild?.kill('SIGTERM');
  } catch {
    // ignore
  }
  try {
    server.close();
  } catch {
    // ignore
  }
  try {
    fs.unlinkSync(sockPath);
  } catch {
    // ignore
  }
  try {
    fs.unlinkSync(cookiePath);
  } catch {
    // ignore
  }
  process.exit(0);
}

function resolveHelperPath(): string | null {
  const fromEnv = process.env.DOTENVUP_KEYCHAIN_HELPER?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  try {
    const req = createRequire(import.meta.url);
    const pkg = req.resolve('@dotenvup/keychain-darwin/package.json');
    const candidate = path.join(path.dirname(pkg), 'bin', 'dotenvup-keychain');
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    // optional
  }
  return null;
}

function startPresenceWatcher(): void {
  if (process.platform !== 'darwin') return;
  if (process.env.DOTENVUP_NO_PRESENCE === '1') return;
  const helper = resolveHelperPath();
  if (!helper) return;

  presenceChild = spawn(helper, ['watch-presence'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let buf = '';
  presenceChild.stdout?.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line) as { event?: string };
        if (ev.event === 'screenLocked' || ev.event === 'sleep' || ev.event === 'logout') {
          clearKey(ev.event);
          shutdown(ev.event);
        }
      } catch {
        // ignore malformed lines
      }
    }
  });
}

try {
  if (fs.existsSync(sockPath)) fs.unlinkSync(sockPath);
} catch {
  // ignore
}

cookie = crypto.randomBytes(32).toString('hex');
writeAtomic(cookiePath, cookie + '\n', 0o600);

const server = net.createServer((socket) => {
  let buf = '';
  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const nl = buf.indexOf('\n');
    if (nl < 0) return;
    const line = buf.slice(0, nl);
    try {
      const req = JSON.parse(line) as AgentRequest;
      respond(socket, handle(req));
    } catch {
      respond(socket, { ok: false, error: 'bad json' });
    }
  });
  socket.on('error', () => {
    // ignore
  });
});

server.listen(sockPath, () => {
  try {
    fs.chmodSync(sockPath, 0o600);
  } catch {
    // ignore
  }
  startPresenceWatcher();
});

server.on('error', (err) => {
  process.stderr.write(`[dotenvup-agent] listen failed: ${err}\n`);
  process.exit(2);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

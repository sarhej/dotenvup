/**
 * up session status|stop — inspect or wipe the in-memory session agent (M3).
 */

import { sessionStatus, sessionStop } from '@dotenvup/format';
import * as logger from '../logger.js';

export async function runStatus(options?: { json?: boolean }): Promise<void> {
  const st = await sessionStatus();
  if (options?.json) {
    console.log(JSON.stringify(st));
    return;
  }
  if (!st.active) {
    logger.info('Session: inactive (cold — next Keychain unlock may prompt)');
    logger.info(`Socket: ${st.socketPath}`);
    return;
  }
  logger.info(`Session: active  Key-Id: ${st.keyId}`);
  if (st.idleMsLeft != null) {
    logger.info(`Idle remaining: ${Math.round(st.idleMsLeft / 1000)}s`);
  }
  if (st.absoluteMsLeft != null) {
    logger.info(`Absolute remaining: ${Math.round(st.absoluteMsLeft / 1000)}s`);
  }
  logger.info(`Socket: ${st.socketPath}`);
}

export async function runStop(): Promise<void> {
  const ok = await sessionStop();
  if (ok) {
    logger.info('Session stopped.');
  } else {
    logger.info('No active session agent.');
  }
}

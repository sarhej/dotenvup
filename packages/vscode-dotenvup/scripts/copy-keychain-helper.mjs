#!/usr/bin/env node
/**
 * Copy runtime binaries the extension needs when format/keychain are bundled into CJS
 * (import.meta path resolution is empty in the bundle).
 * - bin/dotenvup-keychain (macOS)
 * - bin/sessionAgentMain.js (session agent entry)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(here, '..');
const destDir = path.join(extRoot, 'bin');
fs.mkdirSync(destDir, { recursive: true });

// Session agent main (all platforms)
const agentSrc = path.resolve(extRoot, '../format/dist/sessionAgentMain.js');
const agentDest = path.join(destDir, 'sessionAgentMain.js');
if (fs.existsSync(agentSrc)) {
  fs.copyFileSync(agentSrc, agentDest);
  console.log('copy-runtime: sessionAgentMain.js ->', agentDest);
} else {
  console.warn(`copy-runtime: session agent not found at ${agentSrc} (build @dotenvup/format first)`);
}

// Keychain helper (macOS only)
if (process.platform !== 'darwin') {
  console.log('copy-runtime: skip keychain helper (non-darwin)');
  process.exit(0);
}

const helperSrc = path.resolve(extRoot, '../keychain-darwin/bin/dotenvup-keychain');
const helperDest = path.join(destDir, 'dotenvup-keychain');
if (!fs.existsSync(helperSrc)) {
  console.warn(`copy-runtime: helper not found at ${helperSrc} (build @dotenvup/keychain first)`);
  process.exit(0);
}

fs.copyFileSync(helperSrc, helperDest);
fs.chmodSync(helperDest, 0o755);
console.log('copy-runtime: dotenvup-keychain ->', helperDest);

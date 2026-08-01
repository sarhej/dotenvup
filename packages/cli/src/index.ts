/**
 * @dotenvup/cli
 *
 * CLI tool for managing .env.up encrypted environment files.
 */

import { run as runInit } from './commands/init.js';
import { run as runImport } from './commands/import.js';
import { run as runLock } from './commands/lock.js';
import { run as runUnlock } from './commands/unlock.js';
import { run as runShow } from './commands/show.js';
import { run as runRun } from './commands/run.js';
import { run as runKeys } from './commands/keys.js';
import { run as runStatus } from './commands/status.js';
import { run as runKeyExport } from './commands/keyExport.js';
import { run as runKeyImport } from './commands/keyImport.js';
import {
  runStatus as runKeyRecoveryStatus,
  runMigrateEnvelope as runKeyMigrateEnvelope,
} from './commands/keyRecovery.js';
import { run as runKeyUpgrade } from './commands/keyUpgrade.js';
import { run as runRecover } from './commands/recover.js';
import { createRequire } from 'node:module';
import * as recipientsCmd from './commands/recipients.js';
import * as logger from './logger.js';

const require = createRequire(import.meta.url);
export const VERSION = (require('../package.json') as { version: string }).version;

const COMMANDS: Record<
  string,
  (args: string[], options?: Record<string, boolean | string>) => Promise<void>
> = {
  init: async (_args, opts) =>
    runInit({ force: opts?.force as boolean, yes: opts?.yes as boolean }),
  import: async (args, opts) =>
    runImport(args[0], { delete: opts?.delete as boolean }),
  lock: async (_args, opts) =>
    runLock({
      yes: opts?.yes as boolean,
      force: opts?.force as boolean,
      forceDelete: opts?.forceDelete as boolean,
    }),
  unlock: async (_args, opts) => {
    if (opts?.duration && opts?.untilTerminalExit) {
      console.error('Cannot use --duration with --until-terminal-exit.');
      process.exit(1);
    }
    return runUnlock({
      duration: opts?.duration as string,
      untilTerminalExit: opts?.untilTerminalExit as boolean,
      force: opts?.force as boolean,
    });
  },
  show: async (args) => runShow(args[0]),
  run: async (args) => runRun(args),
  keys: async (_args, opts) => runKeys({ json: opts?.json as boolean }),
  status: async (_args, opts) => runStatus({ json: opts?.json as boolean }),
  recover: async (args, opts) =>
    runRecover(args[0], {
      deep: opts?.deep as boolean,
      json: opts?.json as boolean,
    }),
  recipients: async (args, opts) => {
    const sub = args[0];
    if (sub === 'list') return recipientsCmd.runList();
    if (sub === 'add') return recipientsCmd.runAdd(args[1], opts);
    if (sub === 'remove') return recipientsCmd.runRemove(args[1]);
    if (sub === 'discover') return recipientsCmd.runDiscover(opts);
    console.error('Usage: up recipients <list|add|remove|discover> [args]');
    process.exit(1);
  },
  key: async (args, opts) => {
    const sub = args[0];
    if (sub === 'export') {
      return runKeyExport(args[1], { passphrase: opts?.passphrase as string | undefined });
    }
    if (sub === 'import') {
      return runKeyImport(args[1], {
        passphrase: opts?.passphrase as string | undefined,
        force: opts?.force as boolean,
        dryRun: (opts?.dryRun as boolean) || (opts?.['dry-run'] as boolean),
      });
    }
    if (sub === 'recovery') {
      const action = args[1] ?? 'status';
      if (action === 'status') {
        return runKeyRecoveryStatus({ json: opts?.json as boolean });
      }
      console.error('Usage: up key recovery status [--json]');
      process.exit(1);
    }
    if (sub === 'upgrade') {
      return runKeyUpgrade({ yes: opts?.yes as boolean });
    }
    if (sub === 'migrate-envelope') {
      return runKeyMigrateEnvelope({ yes: opts?.yes as boolean });
    }
    console.error('Usage: up key <export|import|upgrade|recovery|migrate-envelope> [args]');
    process.exit(1);
  },
};

function parseArgs(argv: string[]): {
  command: string;
  args: string[];
  options: Record<string, boolean | string>;
} {
  const args: string[] = [];
  const options: Record<string, boolean | string> = {};

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--') {
      args.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--delete') {
      options.delete = true;
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--force-delete') {
      options.forceDelete = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--until-terminal-exit' || arg === '--shell') {
      options.untilTerminalExit = true;
    } else if (arg.startsWith('--')) {
      const rest = arg.slice(2);
      const eq = rest.indexOf('=');
      if (eq >= 0) {
        options[rest.slice(0, eq)] = rest.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        options[rest] = argv[i + 1];
        i++;
      } else {
        options[rest] = true;
      }
    } else if (i === 0) {
      args.push(arg);
    } else {
      args.push(arg);
    }
    i++;
  }

  return {
    command: args[0] || '',
    args: args.slice(1),
    options,
  };
}

function showHelp(): void {
  console.log(`
DotEnvUp CLI v${VERSION}

Usage: up <command> [options] [args...]

Commands:
  init                 Generate keypair (identity.enc + recovery bundle)
  import [file]        Convert .env to .env.up (default: .env)
  lock                 Delete plaintext .env (prompts to list keys; use --yes to skip)
  unlock               Decrypt .env.up, write .env (prompts for duration, default 5m)
  key export [file]    Export keypair to encrypted bundle (.dotenvup-key)
  key import <file>    Import keypair from encrypted bundle
  key upgrade          Opt-in: recovery code + migrate plaintext → identity.enc (safe)
  key recovery status  Whether a recovery bundle exists for the active Key-Id
  key migrate-envelope Alias of key upgrade
  show [key]           Print decrypted values (all or one key)
  run -- <cmd>         Run command with decrypted env (no .env written)
  keys                 List key metadata (no decryption)
  status               Lock state, key freshness, keypair status
  recover [file]       Scan local files for a matching key id (default: .env.up)
  recipients <cmd>     Manage additional recipients (list/add/remove/discover)

Options:
  --force              Overwrite existing keypair (init; archives previous Key-Id)
  --yes, -y            Skip recovery "saved" confirmation (init); skip lock confirm
  --passphrase <text>  Passphrase for key export/import bundle
  --dry-run            Validate key bundle without importing it (key import)
  --delete             Delete source file after import (import)
  --duration <time>    Auto-lock after 5m, 15m, 30m, 1h, 2h, or "never" (unlock; skips prompt if set)
  --until-terminal-exit  Unlock, spawn shell, auto-lock when shell exits (unlock)
  --force, -f          Lock with drift; overwrite .env on unlock when differs
  --force-delete       Delete plaintext .env even if .env.up can't be decrypted (lock)
  --json               Machine-readable output (status, keys, key recovery status)
  --deep               Deep scan full home directory (recover)
  --label <name>       Optional label for recipient add
  --help, -h           Show this help
  --version, -v        Show version

Examples:
  up init
  up import .env
  up import .env --delete
  up unlock
  up unlock --duration 15m
  up unlock --until-terminal-exit
  up key export backup.dotenvup-key
  up key import backup.dotenvup-key --dry-run
  up lock
  up lock --force-delete
  up lock --yes
  up show
  up show DB_HOST
  up run -- npm start
  up keys
  up status
  up recover
  up recover .env.up --deep
  up recipients list
  up recipients add ~/.dotenvup/identity.pub --label alice-laptop
  up recipients discover
`);
}

export async function run(argv: string[]): Promise<void> {
  const { command, args, options } = parseArgs(argv);

  if (options.help) {
    showHelp();
    return;
  }
  if (options.version) {
    console.log(`DotEnvUp CLI v${VERSION}`);
    return;
  }

  if (!command) {
    showHelp();
    process.exit(1);
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "up --help" for usage.');
    process.exit(1);
  }

  try {
    logger.debug(`Executing command: ${command}`, { args, options });
    await handler(args, options);
    logger.debug(`Command completed: ${command}`);
  } catch (err) {
    logger.error(`Command failed: ${command}`, err);
    process.exit(1);
  }
}

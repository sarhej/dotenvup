#!/usr/bin/env node

/**
 * CLI entry point for the `up` command.
 */

import { run } from './index.js';
import * as logger from './logger.js';

run(process.argv.slice(2)).catch((err) => {
  logger.error('Unexpected error', err);
  process.exit(1);
});

#!/usr/bin/env node
import * as esbuild from 'esbuild';
async function main() {
  const entryPoints = ['src/extension.ts'];
  const outfile = 'dist/extension.js';

  await esbuild.build({
    entryPoints,
    bundle: true,
    outfile,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    external: ['vscode'],
    sourcemap: true,
    outExtension: { '.js': '.js' },
  });
  console.log('Bundled extension to', outfile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

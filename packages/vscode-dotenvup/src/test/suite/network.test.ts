import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';

suite('No Runtime Network Instrumentation', () => {
  test('extension runtime files do not contain hardcoded fetch instrumentation', async () => {
    const files = [
      path.join(process.cwd(), 'src/extension.ts'),
      path.join(process.cwd(), 'src/commands/lock.ts'),
      path.join(process.cwd(), 'src/commands/unlock.ts'),
    ];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      assert.ok(!content.includes('fetch('), `Unexpected fetch() in ${file}`);
      assert.ok(!content.includes('127.0.0.1:7244'), `Unexpected localhost ingest endpoint in ${file}`);
      assert.ok(!content.includes('.cursor/debug.log'), `Unexpected debug log path in ${file}`);
    }
  });
});


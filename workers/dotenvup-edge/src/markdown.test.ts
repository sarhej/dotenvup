import assert from "node:assert/strict";
import { markdownToHtml } from "./markdown.ts";

const html = markdownToHtml(`# Title

## What this does not protect against

- Same user can read \`/proc/<pid>/environ\`.
- See [FORMAT_SPEC.md](FORMAT_SPEC.md).

| Platform | What |
|----------|------|
| Linux | Not implemented |
`);

assert.match(html, /<h1>Title<\/h1>/);
assert.match(html, /<h2>What this does not protect against<\/h2>/);
assert.match(html, /<code>\/proc\/&lt;pid&gt;\/environ<\/code>/);
assert.match(html, /href="FORMAT_SPEC.md"/);
assert.match(html, /<table>/);
assert.match(html, /<th>Platform<\/th>/);
assert.match(html, /<td>Linux<\/td>/);
console.log("markdown tests passed");

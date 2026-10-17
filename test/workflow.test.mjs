import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from '../scripts/build-workflow.mjs';

const wf = JSON.parse(build());
const names = new Set(wf.nodes.map((n) => n.name));

test('every Code node is generated and compiles', () => {
  const code = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code');
  assert.ok(code.length >= 8);
  for (const n of code) {
    assert.doesNotMatch(n.parameters.jsCode, /@@|^\s*(export|import) /m, n.name);
    assert.doesNotThrow(() => new Function('$input', '$', '$json', n.parameters.jsCode), n.name);
  }
});

test('every $("node") reference and connection points at an existing node', () => {
  const refs = [...JSON.stringify(wf).matchAll(/\$\(\\?['"]([^'"\\]+)\\?['"]\)/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  for (const r of refs) assert.ok(names.has(r), `unknown node: ${r}`);
  for (const [from, out] of Object.entries(wf.connections)) {
    assert.ok(names.has(from), from);
    for (const c of out.main.flat()) assert.ok(names.has(c.node), c.node);
  }
});

test('no credentials, no real chat id, no personal data on Telegram', () => {
  const raw = readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8');
  assert.ok(wf.nodes.every((n) => !n.credentials));
  const tg = wf.nodes.find((n) => n.type === 'n8n-nodes-base.telegram');
  assert.equal(tg.parameters.chatId, 'REPLACE_WITH_OWNER_CHAT_ID');
  assert.doesNotMatch(tg.parameters.text, /nadawca|Email|temat/i);
  assert.doesNotMatch(raw, /@gmail\.com|sk-[A-Za-z0-9]{10}|Bearer /);
});

test('model nodes retry, and the parser is told not to price', () => {
  for (const name of ['Klasyfikuj (OpenAI)', 'Parsuj wymiary (OpenAI)', 'Generuj mail (OpenAI)']) {
    assert.equal(wf.nodes.find((x) => x.name === name).retryOnFail, true, name);
  }
  const parser = wf.nodes.find((x) => x.name === 'Parsuj wymiary (OpenAI)').parameters.responses.values[0].content;
  assert.match(parser, /NIE liczysz cen/);
});

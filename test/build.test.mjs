// Smoke test: build and check the sample project in examples/basic.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIG = join(ROOT, 'examples/basic/spectrail.config.mjs');
const DIST = join(ROOT, 'examples/basic/.spectrail/dist');
const BIN = join(ROOT, 'packages/spectrail/bin/spectrail.mjs');
const env = { ...process.env, OPENSPEC_TELEMETRY: '0', NO_COLOR: '1' };
const run = (...args) => execFileSync(process.execPath, [BIN, ...args, '--config', CONFIG], { cwd: ROOT, env, encoding: 'utf8' });

test('spectrail build writes the pages of all plugins', { timeout: 300_000 }, () => {
  run('build');
  const page = (p) => readFileSync(join(DIST, p, 'index.html'), 'utf8');
  assert.match(page('.'), /Todo app specs/);
  assert.match(page('specs/todo/items'), /Add an item/);
  assert.match(page('specs/todo/items'), /Refuse an empty item/);
  assert.match(page('board'), /item-due-dates/);
  assert.match(page('board'), /Shared lists/);
  assert.ok(existsSync(join(DIST, 'board/changes/item-due-dates/index.html')));
  assert.match(page('vocabulary'), /checklist/);
});

test('spectrail check passes on the sample', { timeout: 300_000 }, () => {
  assert.match(run('check'), /check: 0 errors/);
});

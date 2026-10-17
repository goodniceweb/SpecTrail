// Unit tests for the pure parsers of the packages.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { globToRegExp, matchesAny, parseSpec } from '@spectrail/core';
import { countTasks, frontmatter } from '@spectrail/kanban';
import { parseDictionary } from '../packages/vocabulary/src/dictionary.mjs';
import { makeMatcher, proseOf, scanText } from '../packages/vocabulary/src/scan.mjs';

test('parseSpec reads requirements and scenarios', () => {
  const spec = parseSpec([
    '# x Specification', '', '## Requirements', '',
    '### Requirement: Add an item', 'The app SHALL add it.', '',
    '#### Scenario: Add one', '- **WHEN** the user adds it', '',
    '#### Scenario: Add two', '- **WHEN** the user adds two', '',
    '### Requirement: Remove an item', 'The app SHALL remove it.',
  ].join('\n'));
  assert.deepEqual(spec.requirements.map((r) => r.name), ['Add an item', 'Remove an item']);
  assert.deepEqual(spec.requirements[0].scenarios.map((s) => s.name), ['Add one', 'Add two']);
});

test('globs match paths', () => {
  assert.ok(globToRegExp('changes/archive/**').test('changes/archive/a/b.md'));
  assert.ok(matchesAny('design/app.pen', ['**/*.pen']));
  assert.ok(!matchesAny('design/app.lib.pen', ['*.pen']));
});

test('frontmatter reads flat key: value lines', () => {
  const { data, body } = frontmatter('---\ntitle: Shared lists\nchange: share\n---\n\nText.\n');
  assert.deepEqual(data, { title: 'Shared lists', change: 'share' });
  assert.equal(body.trim(), 'Text.');
  assert.deepEqual(frontmatter('No frontmatter').data, {});
});

test('countTasks counts checked and open tasks', () => {
  assert.deepEqual(countTasks('- [x] 1.1 a\n- [ ] 1.2 b\n- [X] 1.3 c\n'), { done: 2, total: 3 });
});

const DICT = [
  '# Todo dictionary', '',
  '## Things', '',
  '- **item** — one entry of a list. Do not use: task (for list entries), entry.',
  '- **list** — a named set',
  '  of items.', '',
  '| Do not write | Write instead |',
  '|---|---|',
  '| checklist | list |',
].join('\n');

test('parseDictionary reads terms, bans, and tables', () => {
  const dict = parseDictionary(DICT);
  assert.equal(dict.title, 'Todo dictionary');
  assert.deepEqual(dict.sections.map((s) => s.title), ['Things']);
  const [item, list] = dict.sections[0].entries;
  assert.equal(item.term, 'item');
  assert.deepEqual(item.bans.map((b) => b.word), ['task', 'entry']);
  assert.equal(item.bans[0].limit, 'for list entries');
  assert.equal(list.definition, 'a named set of items.');
  const rule = (w) => dict.rules.find((r) => r.word === w);
  assert.equal(rule('task').contextual, true);
  assert.equal(rule('checklist').contextual, false);
  assert.deepEqual(rule('checklist').instead, ['list']);
});

test('scanText finds banned words in prose, not in code or quotes', () => {
  const match = makeMatcher(parseDictionary(DICT));
  const md = 'Use the checklist.\n\n`checklist` is code.\n\nThe "checklist" button.\n```\nchecklist\n```\n';
  const hits = scanText('a.md', md, match, { quotes: true }).filter((h) => !h.contextual);
  assert.deepEqual(hits.map((h) => [h.word, h.line]), [['checklist', 1]]);
});

test('proseOf keeps only the comments of code, at the same positions', () => {
  const src = 'const a = "// not a comment"; // a comment\n/* two\n lines */ x();\n';
  const lines = proseOf('a.js', src);
  assert.equal(lines.length, src.split('\n').length);
  lines.forEach((l, i) => assert.equal(l.length, src.split('\n')[i].length));
  assert.match(lines[0], /^\s+a comment$/);
  assert.match(lines[1], /^\s+two$/);
  assert.match(lines[2], /^ lines\s+$/);
  assert.equal(proseOf('a.bin', src), null);
});

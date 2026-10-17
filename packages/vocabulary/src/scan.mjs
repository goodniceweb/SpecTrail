// Finds banned words in prose. Markdown files: the text outside code, HTML
// comments, link targets, and (by default) "quoted" UI copy. Code files: the
// comments only. Each extractor keeps the line and column numbers: it
// replaces the skipped text with spaces.
import { extname } from 'node:path';

const blank = (s) => s.replace(/[^\n]/g, ' ');

// maskInline(line) blanks the code spans, link targets, URLs, and HTML tags of one line.
function maskInline(line, { quotes = true } = {}) {
  let s = line.replace(/`[^`]*`/g, blank);
  s = s.replace(/\]\([^)]*\)/g, (m) => `]${blank(m.slice(1))}`);
  s = s.replace(/\bhttps?:\/\/\S+/g, blank);
  s = s.replace(/<\/?[A-Za-z][^>]*>/g, blank);
  if (quotes) s = s.replace(/"[^"\n]*"|“[^”\n]*”/g, blank);
  return s;
}

// markdownProse(text) -> lines with only the prose left.
export function markdownProse(text, opts = {}) {
  const lines = text.split('\n');
  const out = [];
  let inFence = false;
  let inComment = false;
  let inFront = lines[0] === '---';
  lines.forEach((line, i) => {
    if (inFront) {
      if (i > 0 && line === '---') inFront = false;
      out.push(blank(line));
      return;
    }
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(blank(line));
      return;
    }
    if (inFence) {
      out.push(blank(line));
      return;
    }
    // HTML comments, also over more lines.
    let s = '';
    let rest = line;
    while (rest.length) {
      if (inComment) {
        const end = rest.indexOf('-->');
        if (end < 0) {
          s += blank(rest);
          rest = '';
        } else {
          s += blank(rest.slice(0, end + 3));
          rest = rest.slice(end + 3);
          inComment = false;
        }
      } else {
        const start = rest.indexOf('<!--');
        if (start < 0) {
          s += rest;
          rest = '';
        } else {
          s += rest.slice(0, start);
          rest = rest.slice(start);
          inComment = true;
        }
      }
    }
    // A heading anchor such as `{#req-slug}` is not prose.
    out.push(maskInline(s.replace(/\{#[^}]*\}/g, blank), opts));
  });
  return out;
}

// Comment syntax for each file extension.
const SLASH = { line: ['//'], block: [['/*', '*/']] };
const LANGS = {
  js: { ...SLASH, strings: ['"', "'", '`'] },
  mjs: { ...SLASH, strings: ['"', "'", '`'] },
  cjs: { ...SLASH, strings: ['"', "'", '`'] },
  jsx: { ...SLASH, strings: ['"', "'", '`'] },
  ts: { ...SLASH, strings: ['"', "'", '`'] },
  tsx: { ...SLASH, strings: ['"', "'", '`'] },
  vue: { line: [], block: [['<!--', '-->']], strings: [] },
  svelte: { line: [], block: [['<!--', '-->']], strings: [] },
  dart: { ...SLASH, strings: ['"', "'"] },
  // Rust: `'` also starts a lifetime, so only `"` starts a string.
  rs: { ...SLASH, strings: ['"'] },
  go: { ...SLASH, strings: ['"', '`'] },
  java: { ...SLASH, strings: ['"'] },
  kt: { ...SLASH, strings: ['"'] },
  swift: { ...SLASH, strings: ['"'] },
  c: { ...SLASH, strings: ['"'] },
  h: { ...SLASH, strings: ['"'] },
  cc: { ...SLASH, strings: ['"'] },
  cpp: { ...SLASH, strings: ['"'] },
  hpp: { ...SLASH, strings: ['"'] },
  cs: { ...SLASH, strings: ['"'] },
  css: { line: [], block: [['/*', '*/']], strings: ['"', "'"] },
  scss: { ...SLASH, strings: ['"', "'"] },
  // Elixir: `@doc """` and `@moduledoc """` blocks are documentation prose.
  ex: { line: ['#'], block: [], strings: ['"'], docs: true },
  exs: { line: ['#'], block: [], strings: ['"'], docs: true },
  heex: { line: [], block: [['<%!--', '--%>'], ['<!--', '-->']], strings: [] },
  py: { line: ['#'], block: [], strings: ['"', "'"] },
  rb: { line: ['#'], block: [], strings: ['"', "'"] },
  sh: { line: ['#'], block: [], strings: ['"', "'"] },
  bash: { line: ['#'], block: [], strings: ['"', "'"] },
  yaml: { line: ['#'], block: [], strings: ['"', "'"] },
  yml: { line: ['#'], block: [], strings: ['"', "'"] },
  toml: { line: ['#'], block: [], strings: ['"', "'"] },
  html: { line: [], block: [['<!--', '-->']], strings: [] },
};

export const CODE_EXTS = Object.keys(LANGS);
export const PROSE_EXTS = ['md', 'markdown', 'mdx'];

// codeComments(text, lang) -> lines with only the comment text left.
export function codeComments(text, lang) {
  const out = [];
  let mode = null; // null | { string: q } | { block: end } | 'line' | 'doc'
  let cur = '';
  const push = () => {
    out.push(cur);
    cur = '';
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\n') {
      if (mode === 'line') mode = null;
      push();
      continue;
    }
    if (mode === 'line' || mode === 'doc' || mode?.block) {
      if (mode === 'doc' && text.startsWith('"""', i)) {
        cur += '   ';
        i += 2;
        mode = null;
        continue;
      }
      if (mode?.block && text.startsWith(mode.block, i)) {
        cur += ' '.repeat(mode.block.length);
        i += mode.block.length - 1;
        mode = null;
        continue;
      }
      cur += ch;
      continue;
    }
    if (mode?.string) {
      if (ch === '\\') {
        cur += '  ';
        i += 1;
        if (text[i] === '\n') push();
        continue;
      }
      if (ch === mode.string) mode = null;
      cur += ' ';
      continue;
    }
    if (lang.docs && /@(module)?doc\s+"""$/.test(text.slice(Math.max(0, i - 20), i + 3))) {
      cur += '   ';
      i += 2;
      mode = 'doc';
      continue;
    }
    const block = lang.block.find(([open]) => text.startsWith(open, i));
    if (block) {
      cur += ' '.repeat(block[0].length);
      i += block[0].length - 1;
      mode = { block: block[1] };
      continue;
    }
    const line = lang.line.find((open) => text.startsWith(open, i));
    if (line) {
      cur += ' '.repeat(line.length);
      i += line.length - 1;
      mode = 'line';
      continue;
    }
    if (lang.strings.includes(ch)) {
      mode = { string: ch };
      cur += ' ';
      continue;
    }
    cur += ' ';
  }
  push();
  // Inside comments, code spans and URLs are not prose either.
  return out.map((l) => maskInline(l, { quotes: false }));
}

// proseOf(file, text, opts) -> lines of prose, or null when the file type is unknown.
export function proseOf(file, text, opts = {}) {
  const ext = extname(file).slice(1).toLowerCase();
  if (PROSE_EXTS.includes(ext)) return markdownProse(text, opts);
  if (LANGS[ext]) return codeComments(text, LANGS[ext]);
  return null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const L = '[\\p{L}\\p{N}_]';

// phraseRe(word) -> RegExp for the word as a whole word, with an optional plural `s`/`es`.
// An all-caps word (AI, CTA) matches only in capitals.
function phraseRe(word) {
  const body = word.split(/\s+/).map(escapeRe).join('\\s+');
  const plural = !/[a-z]$/i.test(word) || /s$/i.test(word) ? '' : /(x|z|ch|sh)$/i.test(word) ? '(?:es)?' : 's?';
  const caps = word === word.toUpperCase() && /[A-Z]/.test(word);
  return new RegExp(`(?<!${L}|-)${body}${plural}(?!${L}|-)`, caps ? 'gu' : 'giu');
}

// approvedTerms(dict) -> the entry terms and the phrases of the "Write instead" column.
export function approvedTerms(dict) {
  const terms = dict.sections.flatMap((s) => s.entries.map((e) => e.term));
  const instead = dict.tables.flatMap((t) => t.rows.flatMap((r) => r.instead.split(/,|\s\/\s/)));
  return [...new Set([...terms, ...instead].flatMap((t) => t.split(/\s+\/\s+/))
    .map((t) => t.replace(/\([^)]*\)/g, '').replace(/^(the|a|an)\s+/i, '').replace(/\.\.\.|…/g, '').trim())
    .filter(Boolean))];
}

export { phraseRe };

// makeMatcher(dictionary) -> (line) -> [{ rule, index, length }]
// A match inside an approved term ("hand sheet" for "sheet") does not count.
export function makeMatcher(dict) {
  const rules = dict.rules.map((r) => ({ rule: r, re: phraseRe(r.word) }));
  const approved = approvedTerms(dict)
    .filter((t) => /\s|-/.test(t))
    .map((t) => phraseRe(t));
  return (line) => {
    const shields = [];
    for (const re of approved) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) shields.push([m.index, m.index + m[0].length]);
    }
    const found = [];
    for (const { rule, re } of rules) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        const a = m.index;
        const b = a + m[0].length;
        if (shields.some(([x, y]) => x <= a && b <= y && y - x > b - a)) continue;
        found.push({ rule, index: a, length: m[0].length, text: m[0] });
      }
    }
    // Keep the longest match where two overlap ("AI bot" over "AI").
    found.sort((p, q) => p.index - q.index || q.length - p.length);
    return found.filter((f, i) => !found.slice(0, i).some((g) => g.index <= f.index && f.index + f.length <= g.index + g.length));
  };
}

// scanText(file, text, match, opts) -> [{ file, line, col, word, text, contextual, excerpt }]
export function scanText(file, text, match, opts = {}) {
  const prose = proseOf(file, text, opts);
  if (!prose) return [];
  const raw = text.split('\n');
  const out = [];
  prose.forEach((line, i) => {
    if (!/\S/.test(line)) return;
    for (const f of match(line)) {
      const src = raw[i] || '';
      const from = Math.max(0, f.index - 60);
      const to = Math.min(src.length, f.index + f.length + 60);
      out.push({
        file,
        line: i + 1,
        col: f.index + 1,
        word: f.rule.word,
        text: f.text,
        contextual: f.rule.contextual,
        excerpt: {
          before: `${from > 0 ? '…' : ''}${src.slice(from, f.index)}`,
          match: src.slice(f.index, f.index + f.length),
          after: `${src.slice(f.index + f.length, to)}${to < src.length ? '…' : ''}`,
        },
      });
    }
  });
  return out;
}

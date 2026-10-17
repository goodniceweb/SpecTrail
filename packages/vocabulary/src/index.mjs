// @spectrail/vocabulary: one term for one thing (inspired by DDD).
// It reads the project dictionary (see dictionary.mjs for the format), shows
// each approved term with its banned synonyms, and finds the banned words in
// the OpenSpec files or in the whole repo.
//
// Two classes of bans:
//   banned     no sense limit, and the dictionary never uses the word itself.
//              `spectrail check` reports these.
//   contextual the ban applies in one sense only ("slot (for seats)"). A text
//              search cannot see the sense, so the page lists these for review.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, listFiles, matchesAny } from '@spectrail/core';
import { parseDictionary } from './dictionary.mjs';
import { CODE_EXTS, PROSE_EXTS, makeMatcher, scanText } from './scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_FILE = 1024 * 1024; // larger files are data, not prose
const SAMPLES = 100; // examples kept for each contextual word
const DEFAULT_REPO_EXCLUDE = [
  '**/node_modules/**', '**/vendor/**', '**/dist/**', '**/build/**', '**/_build/**', '**/deps/**',
  '**/*.min.js', '**/package-lock.json', '**/CHANGELOG.md',
];

// readScannable(full) -> the text of a file, or null if it is too big or not readable.
function readScannable(full) {
  try {
    if (statSync(full).size > MAX_FILE) return null;
    return readFileSync(full, 'utf8');
  } catch {
    return null;
  }
}

// addContextual(byWord, hit, item, rule) counts a contextual hit and keeps a few samples.
function addContextual(byWord, hit, item, rule) {
  if (!byWord.has(hit.word)) {
    byWord.set(hit.word, { word: hit.word, limits: rule?.limits || [], instead: rule?.instead || [], count: 0, items: [] });
  }
  const w = byWord.get(hit.word);
  w.count += 1;
  if (w.items.length < SAMPLES) w.items.push(item);
}

// vocabulary(options)
//   file             the dictionary; default `<openspecDir>/dictionary.md`
//   openspecExclude  globs under openspec/ to skip; default ['changes/archive/**'] (history)
//   repo             { include: [glob], exclude: [glob] } for the whole-repo check.
//                    Default: every markdown file, and the comments of known code files.
//   quotes           skip "quoted" text in markdown (UI copy); default true
//   rules            { word: 'banned' | 'contextual' | 'off' } to set a rule by hand
//   level            'warning' (default) or 'error' for banned words in `spectrail check`
//   checkRepo        `spectrail check` also checks the whole repo; default false
//   base             the URL folder of the page; default '/vocabulary/'
export function vocabulary(options = {}) {
  const base = `/${(options.base || '/vocabulary/').replace(/^\/+|\/+$/g, '')}/`;
  const dataDir = 'vocabulary-data';

  const dictFile = (ctx) => {
    if (!options.file) return join(ctx.config.openspecDir, 'dictionary.md');
    return isAbsolute(options.file) ? options.file : resolve(ctx.root, options.file);
  };
  const rel = (ctx, f) => relative(ctx.root, f).split(sep).join('/');

  function readDictionary(ctx) {
    const file = dictFile(ctx);
    if (!existsSync(file)) return null;
    const dict = parseDictionary(readFileSync(file, 'utf8'));
    const set = options.rules || {};
    dict.rules = dict.rules
      .filter((r) => set[r.word] !== 'off')
      .map((r) => (set[r.word] ? { ...r, contextual: set[r.word] === 'contextual', manual: true } : r));
    return dict;
  }

  // files(ctx, scope) -> repo-relative paths to scan.
  function files(ctx, scope) {
    const skipDict = rel(ctx, dictFile(ctx));
    if (scope === 'openspec') {
      const exclude = options.openspecExclude || ['changes/archive/**'];
      const dir = ctx.config.openspecDir;
      return listFiles(dir)
        .filter((f) => f.endsWith('.md'))
        .filter((f) => !matchesAny(relative(dir, f).split(sep).join('/'), exclude))
        .map((f) => rel(ctx, f))
        .filter((f) => f !== skipDict);
    }
    let all;
    try {
      // git knows the ignored files; untracked files that are not ignored count too.
      all = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
        cwd: ctx.root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
      }).split('\n').filter(Boolean);
    } catch {
      all = listFiles(ctx.root, (f) => /[/\\](node_modules|\.git)$/.test(f)).map((f) => rel(ctx, f));
    }
    const exts = new Set([...PROSE_EXTS, ...CODE_EXTS]);
    const include = options.repo?.include;
    const exclude = [...DEFAULT_REPO_EXCLUDE, ...(options.repo?.exclude || [])];
    return all.filter((f) => {
      if (f === skipDict) return false;
      if (include ? !matchesAny(f, include) : !exts.has(f.split('.').pop().toLowerCase())) return false;
      return !matchesAny(f, exclude);
    });
  }

  // run(ctx, scope) -> the result payload for the page and the checks.
  function run(ctx, scope) {
    const dict = readDictionary(ctx);
    if (!dict) return { scope, error: `No dictionary at ${rel(ctx, dictFile(ctx))}` };
    const match = makeMatcher(dict);
    const list = files(ctx, scope);
    const hard = [];
    const byWord = new Map();
    const ruleOf = new Map(dict.rules.map((r) => [r.word, r]));
    let scanned = 0;
    for (const f of list) {
      const text = readScannable(join(ctx.root, f));
      if (text === null) continue;
      scanned += 1;
      for (const hit of scanText(f, text, match, { quotes: options.quotes !== false })) {
        const rule = ruleOf.get(hit.word);
        const url = ctx.fileUrl(f);
        const item = { ...hit, url: url ? `${url}#L${hit.line}` : null, instead: rule?.instead || [] };
        if (hit.contextual) addContextual(byWord, hit, item, rule);
        else hard.push(item);
      }
    }
    return {
      scope,
      at: new Date().toISOString(),
      files: scanned,
      hard,
      contextual: [...byWord.values()].sort((a, b) => b.count - a.count),
    };
  }

  function chips(bans, ruleOf) {
    return bans
      .map((b) => {
        const r = ruleOf.get(b.word.toLowerCase());
        const cls = !r ? 'off' : r.contextual ? 'ctx' : 'hard';
        const tip = r?.limits.length ? ` title="${esc(r.limits.join('; '))}"` : '';
        return `<span class="st-ban st-ban-${cls}"${tip}>${esc(b.word)}${b.limit ? ` <em>(${esc(b.limit)})</em>` : ''}</span>`;
      })
      .join(' ');
  }

  function page(ctx) {
    const d = ctx.data.vocabulary;
    const lines = ['---', 'title: Vocabulary', '---', ''];
    if (!d.dict) {
      lines.push('# Vocabulary', '', `No dictionary at \`${rel(ctx, dictFile(ctx))}\`. Set the \`file\` option of the vocabulary plugin.`, '');
      return lines.join('\n');
    }
    const { dict } = d;
    const ruleOf = new Map(dict.rules.map((r) => [r.word.toLowerCase(), r]));
    const hardRules = dict.rules.filter((r) => !r.contextual);
    const terms = dict.sections.reduce((n, s) => n + s.entries.length, 0);
    lines.push(
      '::: v-pre',
      `# ${esc(dict.title)}`, '',
      `The dictionary \`${rel(ctx, dictFile(ctx))}\` has ${terms} terms and bans ${dict.rules.length} words.`,
      `<span class="st-ban st-ban-hard">${hardRules.length} banned</span> words are wrong in every sense.`,
      `<span class="st-ban st-ban-ctx">${dict.rules.length - hardRules.length} words</span> are wrong only in one sense: a person must check the sense.`,
      '', ':::', '',
      '<StVocabularyChecks />', '',
      '::: v-pre',
    );
    for (const s of dict.sections) {
      lines.push(`## ${esc(s.title)}`, '');
      const rows = s.entries.map((e) =>
        `<tr><td><strong>${esc(e.term)}</strong>${e.note ? ` <span class="st-vnote">(${esc(e.note)})</span>` : ''}</td>` +
        `<td>${esc(e.definition.replace(/\s*Do not\s+use:[^.]*\.\s*/i, ' ').trim())}</td><td>${chips(e.bans, ruleOf)}</td></tr>`);
      lines.push(`<table class="st-vtable"><thead><tr><th>Term</th><th>Meaning</th><th>Do not use</th></tr></thead><tbody>${rows.join('')}</tbody></table>`, '');
    }
    lines.push('## All banned words {#all-banned-words}', '');
    const rows = dict.rules.map((r) =>
      `<tr><td>${chips([{ word: r.word }], ruleOf)}</td><td>${esc(r.instead.join(' / '))}</td>` +
      `<td>${r.contextual ? `${esc(r.limits.join('; '))}` : 'every sense'}${r.manual ? ' <span class="st-vnote">(set in the config)</span>' : ''}</td></tr>`);
    lines.push(`<table class="st-vtable"><thead><tr><th>Word</th><th>Write instead</th><th>Banned in</th></tr></thead><tbody>${rows.join('')}</tbody></table>`, '', ':::', '');
    return lines.join('\n');
  }

  return {
    name: 'vocabulary',
    styles: [join(HERE, 'vocabulary.css')],
    client: join(HERE, 'client'),

    load(ctx) {
      const dict = readDictionary(ctx);
      const result = dict ? run(ctx, 'openspec') : null;
      ctx.data.vocabulary = { dict, result };
      // The static build has no server, so the page reads this file.
      const out = ctx.cacheDir('vocabulary');
      mkdirSync(out, { recursive: true });
      if (result) writeFileSync(join(out, 'openspec.json'), JSON.stringify(result));
    },

    api: {
      check: (ctx, params) => run(ctx, params.scope === 'repo' ? 'repo' : 'openspec'),
    },

    cards(ctx) {
      const { result } = ctx.data.vocabulary;
      if (!result) return [];
      const ctxCount = result.contextual.reduce((n, w) => n + w.count, 0);
      return [{
        title: 'Banned words in OpenSpec',
        value: result.hard.length,
        note: `${ctxCount} to check the sense`,
        link: base,
        tone: result.hard.length ? 'warn' : 'ok',
      }];
    },

    pages: (ctx) => [{ path: `${base.slice(1)}index.md`, content: page(ctx) }],
    nav: () => [{ text: 'Vocabulary', link: base }],
    sidebar: () => [{ text: 'Vocabulary', link: base }],
    publicDirs: (ctx) => [{ from: ctx.cacheDir('vocabulary'), to: dataDir, match: (f) => f.endsWith('.json') }],

    watch(ctx) {
      const file = dictFile(ctx);
      if (!relative(ctx.config.openspecDir, file).startsWith('..')) return [];
      return [{ dir: dirname(file), match: (n) => n === file.split(sep).pop() }];
    },

    checks(ctx) {
      const { dict, result } = ctx.data.vocabulary;
      if (!dict) return [{ level: 'warning', message: `no dictionary at ${rel(ctx, dictFile(ctx))}` }];
      const level = options.level === 'error' ? 'error' : 'warning';
      const results = [result];
      if (options.checkRepo) results.push(run(ctx, 'repo'));
      const seen = new Set();
      const out = [];
      for (const r of results) {
        for (const h of r.hard) {
          const key = `${h.file}:${h.line}:${h.col}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const instead = h.instead.length ? ` (write: ${h.instead.join(' / ')})` : '';
          out.push({ level, message: `${h.file}:${h.line}: "${h.text}" is banned${instead}` });
        }
      }
      return out;
    },
  };
}

export default vocabulary;

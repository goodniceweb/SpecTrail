// @spectrail/kanban: a read-only board of ideas and OpenSpec changes.
// Columns:
//   Exploring    an .md file in the ideas folder, not linked to a change yet
//   Todo         an active change with no checked task (or no tasks yet)
//   In progress  an active change with some checked tasks
//   Testing      an active change with all tasks checked, not archived
//   Done         a folder in changes/archive/, dated from its name prefix
// An idea is linked to a change when its frontmatter has `change: <name>`,
// or when its slug is the name of a change. A linked idea leaves Exploring.
// Each card opens a page with the files of the idea or the change.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, listFiles } from '@spectrail/core';
import { installIdeaCommand } from './install.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})-(.+)$/;
const COLUMNS = [
  ['exploring', 'Exploring'],
  ['todo', 'Todo'],
  ['progress', 'In progress'],
  ['testing', 'Testing'],
  ['done', 'Done'],
];
// The change files that a card page shows, in this order. Other top-level .md files follow.
const CHANGE_FILES = ['proposal.md', 'design.md', 'tasks.md'];

// frontmatter(text) -> { data, body }. Only flat `key: value` lines.
export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { data, body: text.slice(m[0].length) };
}

// countTasks(text) -> { done, total } from `- [x]` and `- [ ]` lines.
export function countTasks(text) {
  const all = text.match(/^\s*[-*] \[[ xX]\]/gm) || [];
  const done = all.filter((l) => /\[[xX]\]/.test(l)).length;
  return { done, total: all.length };
}

// whyOf(proposal) -> the first paragraph under `## Why`, or the first paragraph.
function whyOf(text) {
  // `(?![\s\S])` is the end of the text; `$` with the m flag is the end of a line.
  const m = text.match(/^##\s+Why\s*\n+([\s\S]*?)(\n\s*\n|(?![\s\S]))/m) || text.match(/^(?!#)(\S[^\n]*(?:\n(?!\s*\n)[^\n]*)*)/m);
  if (!m) return '';
  const s = m[1].replace(/^\s*[-*]\s+/gm, '').replace(/\s*\n\s*/g, ' ').trim();
  return s.length > 220 ? `${s.slice(0, 217).replace(/\s+\S*$/, '')}…` : s;
}

// mdBody(text) -> markdown that is safe in a `::: v-pre` page: the headings go one
// level down, `<` outside code is text, and task boxes become marks.
function mdBody(text) {
  let inFence = false;
  return frontmatter(text).body.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    let out = line.replace(/^(#{1,5})(\s)/, '#$1$2');
    out = out.replace(/^(\s*[-*]) \[[xX]\]/, '$1 ✅').replace(/^(\s*[-*]) \[ \]/, '$1 ⬜');
    return out.split(/(`[^`]+`)/).map((p, i) => (i % 2 ? p : p.replace(/</g, '&lt;'))).join('');
  }).join('\n');
}

// kanban(options)
//   ideasDir   the folder of the ideas; default `<openspecDir>/ideas`
//   base       the URL folder of the board; default '/board/'
export function kanban(options = {}) {
  const base = `/${(options.base || '/board/').replace(/^\/+|\/+$/g, '')}/`;
  const ideasDir = (ctx) => {
    if (!options.ideasDir) return join(ctx.config.openspecDir, 'ideas');
    return isAbsolute(options.ideasDir) ? options.ideasDir : resolve(ctx.root, options.ideasDir);
  };
  const rel = (ctx, file) => relative(ctx.root, file).split(sep).join('/');

  function specsOf(ctx, dir) {
    const specsDir = join(dir, 'specs');
    return listFiles(specsDir)
      .filter((f) => f.endsWith(`${sep}spec.md`))
      .map((f) => relative(specsDir, dirname(f)).split(sep).join('/'))
      .sort();
  }

  function changeCard(ctx, dir, fields) {
    const proposal = join(dir, 'proposal.md');
    return {
      ...fields,
      dir,
      summary: existsSync(proposal) ? whyOf(frontmatter(readFileSync(proposal, 'utf8')).body) : '',
      specs: specsOf(ctx, dir),
      ideas: [],
    };
  }

  function load(ctx) {
    const { changesDir } = ctx.config;
    const cards = [];

    for (const c of ctx.openspec.changes) {
      const done = c.completedTasks || 0;
      const total = c.totalTasks || 0;
      const column = done === 0 ? 'todo' : done < total ? 'progress' : 'testing';
      cards.push(changeCard(ctx, join(changesDir, c.name), {
        kind: 'change', column, name: c.name, title: c.name, done, total,
        date: c.lastModified ? c.lastModified.slice(0, 10) : null,
        url: `${base}changes/${c.name}/`,
      }));
    }

    const archiveDir = join(changesDir, 'archive');
    if (existsSync(archiveDir)) {
      for (const folder of readdirSync(archiveDir).sort().reverse()) {
        const dir = join(archiveDir, folder);
        if (!statSync(dir).isDirectory()) continue;
        const m = folder.match(DATE_PREFIX);
        const tasksFile = join(dir, 'tasks.md');
        const { done, total } = existsSync(tasksFile) ? countTasks(readFileSync(tasksFile, 'utf8')) : { done: 0, total: 0 };
        cards.push(changeCard(ctx, dir, {
          kind: 'archive', column: 'done', name: m ? m[2] : folder, title: m ? m[2] : folder, done, total,
          date: m ? m[1] : null,
          url: `${base}archive/${folder}/`,
        }));
      }
    }

    const byName = new Map(cards.map((c) => [c.name, c]));
    const ideas = [];
    const dir = ideasDir(ctx);
    if (existsSync(dir)) {
      for (const file of readdirSync(dir).sort().reverse()) {
        if (!file.endsWith('.md') || /^readme\.md$/i.test(file)) continue;
        const full = join(dir, file);
        const text = readFileSync(full, 'utf8');
        const { data, body } = frontmatter(text);
        const stem = file.replace(/\.md$/, '');
        const m = stem.match(DATE_PREFIX);
        const slug = m ? m[2] : stem;
        const heading = body.match(/^#\s+(.+)$/m)?.[1];
        const idea = {
          kind: 'idea', column: 'exploring', file: full, slug, name: slug,
          title: data.title || heading || slug,
          date: data.created || (m ? m[1] : null),
          change: data.change || (byName.has(slug) ? slug : null),
          url: `${base}ideas/${stem}/`,
          summary: whyOf(body.replace(/^##[^\n]*\n/gm, '\n')),
        };
        ideas.push(idea);
        const target = idea.change && byName.get(idea.change);
        if (target) target.ideas.push(idea);
        else if (!idea.change) cards.push(idea);
      }
    }
    ctx.data.kanban = { cards, ideas, ideasDir: dir };
  }

  function cardHtml(c) {
    const meta = [c.kind === 'idea' ? 'idea' : `<code>${esc(c.name)}</code>`];
    if (c.date) meta.push(esc(c.date));
    const progress = c.kind !== 'idea' && c.total
      ? `<span class="st-kbar"><span style="width:${Math.round((c.done / c.total) * 100)}%"></span></span><span class="st-knum">${c.done}/${c.total}</span>`
      : '';
    return (
      `<a class="st-kcard" href="${esc(c.url)}"${c.date ? ` data-date="${esc(c.date)}"` : ''}>` +
      `<span class="st-ktitle">${esc(c.kind === 'idea' ? c.title : c.title.replace(/-/g, ' '))}</span>` +
      `<span class="st-kmeta">${meta.join(' · ')}</span>` +
      (progress ? `<span class="st-kprogress">${progress}</span>` : '') +
      (c.summary ? `<span class="st-ksummary">${esc(c.summary)}</span>` : '') +
      (c.ideas?.length ? `<span class="st-kmeta">from idea: ${c.ideas.map((i) => esc(i.title)).join(', ')}</span>` : '') +
      '</a>'
    );
  }

  function boardPage(ctx) {
    const { cards } = ctx.data.kanban;
    const cols = COLUMNS.map(([id, title]) => {
      const list = cards.filter((c) => c.column === id);
      const body = list.length ? list.map(cardHtml).join('') : '<span class="st-kempty">No cards</span>';
      return `<section class="st-kcol st-kcol-${id}"><h2 class="st-khead">${esc(title)} <span class="st-kcount">${list.length}</span></h2>${body}</section>`;
    });
    return [
      '---', 'title: Board', 'layout: page', 'aside: false', '---', '',
      '<div class="st-kpage">', '',
      '<h1 class="st-ktop">Board</h1>', '',
      '<StBoardFilter />', '',
      '::: v-pre',
      `<div class="st-board">${cols.join('')}</div>`,
      ':::', '',
      '</div>', '',
    ].join('\n');
  }

  function cardPage(ctx, c) {
    const column = COLUMNS.find(([id]) => id === c.column)?.[1] || 'Linked to a change';
    const page = c.kind === 'idea' ? ['pageClass: st-idea-page'] : [];
    const lines = ['---', `title: ${JSON.stringify(c.title)}`, ...page, '---', '', '::: v-pre', `# ${esc(c.kind === 'idea' ? c.title : c.name)}`, ''];
    const facts = [`Column: ${column}`];
    if (c.date) facts.push(`${c.kind === 'archive' ? 'Archived' : c.kind === 'idea' ? 'Created' : 'Last change'}: ${c.date}`);
    if (c.kind !== 'idea' && c.total) facts.push(`Tasks: ${c.done}/${c.total}`);
    lines.push(`<p class="st-kfacts">${facts.map(esc).join(' · ')} · <a href="${base}">Board</a></p>`, '');

    if (c.kind === 'idea') {
      if (c.change) {
        const target = ctx.data.kanban.cards.find((x) => x.name === c.change && x.kind !== 'idea');
        lines.push(target ? `This idea became the change [\`${c.change}\`](${target.url}).` : `This idea names the change \`${c.change}\`, but no such change exists.`, '');
      }
      lines.push(`File: \`${rel(ctx, c.file)}\``, '', mdBody(readFileSync(c.file, 'utf8')), '');
    } else {
      if (c.ideas.length) {
        lines.push(`From the ideas: ${c.ideas.map((i) => `[${esc(i.title)}](${i.url})`).join(', ')}.`, '');
      }
      if (c.specs.length) {
        lines.push('Specs that this change touches:', '');
        for (const id of c.specs) {
          const url = ctx.links.spec(id);
          lines.push(`- ${url && ctx.specs.some((s) => s.id === id) ? `[\`${id}\`](${url})` : `\`${id}\` (new)`}`);
        }
        lines.push('');
      }
      const extra = readdirSync(c.dir).filter((f) => f.endsWith('.md') && !CHANGE_FILES.includes(f)).sort();
      for (const f of [...CHANGE_FILES, ...extra]) {
        const file = join(c.dir, f);
        if (!existsSync(file)) continue;
        const text = readFileSync(file, 'utf8');
        // A file with its own title (`# Proposal`) needs no file-name heading.
        const titled = /^\s*# /.test(frontmatter(text).body);
        if (!titled) lines.push(`## ${f} {#${f.replace(/\.md$/, '')}}`, '');
        lines.push(mdBody(text), '');
      }
    }
    lines.push(':::', '');
    return lines.join('\n');
  }

  return {
    name: 'kanban',
    styles: [join(HERE, 'kanban.css')],
    client: join(HERE, 'client'),

    load,

    cards(ctx) {
      const { cards } = ctx.data.kanban;
      const n = (col) => cards.filter((c) => c.column === col).length;
      return [{
        title: 'Board',
        value: `${n('progress') + n('testing')} active`,
        note: `${n('exploring')} ideas · ${n('todo')} todo · ${n('progress')} in progress · ${n('testing')} testing · ${n('done')} done`,
        link: base,
      }];
    },

    pages(ctx) {
      const { cards, ideas } = ctx.data.kanban;
      const pages = [{ path: `${base.slice(1)}index.md`, content: boardPage(ctx) }];
      for (const c of cards.filter((x) => x.kind !== 'idea')) {
        pages.push({ path: `${c.url.slice(1)}index.md`, content: cardPage(ctx, c) });
      }
      for (const i of ideas) pages.push({ path: `${i.url.slice(1)}index.md`, content: cardPage(ctx, i) });
      return pages;
    },

    nav: () => [{ text: 'Board', link: base }],
    sidebar: () => [{ text: 'Board', link: base }],

    // The core watches openspec/. An ideas folder outside it needs its own watch.
    watch(ctx) {
      const dir = ideasDir(ctx);
      if (!relative(ctx.config.openspecDir, dir).startsWith('..')) return [];
      return [{ dir, match: (n) => n.endsWith('.md') }];
    },

    checks(ctx) {
      const { cards, ideas } = ctx.data.kanban;
      return ideas
        .filter((i) => i.change && !cards.some((c) => c.kind !== 'idea' && c.name === i.change))
        .map((i) => ({ level: 'warning', message: `idea "${i.title}" names the change ${i.change}, but no such change exists` }));
    },

    commands: {
      'install-idea-command': {
        describe: 'write .claude/commands/opsx/idea.md (add --force to replace a changed file)',
        run: (ctx, args) => installIdeaCommand(ctx, { ideasDir: rel(ctx, ideasDir(ctx)), force: args.includes('--force') }),
      },
    },
  };
}

export default kanban;

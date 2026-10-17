// @spectrail/reader: one page per OpenSpec capability, as the spec is on disk,
// with anchors for each requirement and scenario, links for code spans, and
// optional test coverage under each scenario.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, scenKey, slugify } from '@spectrail/core';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMENT_LINE = /^\s*<!--.*-->\s*$/;

const scenAnchor = (reqSlug, scenSlug) => `${reqSlug}--${scenSlug}`;

// reader(options)
//   base       the URL folder of the spec pages; default '/specs/'
//   coverage   async (ctx) -> Map(`cap:req:scen` -> [item]). An item is
//              { kind, label, url?, note?, code?: bool, missing?: bool }.
//              A scenario is covered when it has one item that is not missing.
//
// Hooks that this plugin calls (other plugins can add them):
//   'reader:hideLine'(line, { spec, req }) -> true to hide a line of spec text.
//     The requirement blocks go where the first hidden line of the requirement was.
//   'reader:requirement'({ spec, req }) -> HTML under the requirement text
//   'reader:scenario'({ spec, req, scen }) -> HTML under the scenario
export function reader(options = {}) {
  const base = `/${(options.base || '/specs/').replace(/^\/+|\/+$/g, '')}/`;

  const data = (ctx) => ctx.data.reader;

  return {
    name: 'reader',
    styles: [join(HERE, 'reader.css')],
    client: join(HERE, 'client'),

    setup(ctx) {
      ctx.links.spec = (id) => (id ? `${base}${id}/` : base);
      ctx.links.requirement = (id, req) => `${base}${id}/#${req}`;
      ctx.links.scenario = (id, req, scen) => `${base}${id}/#${scenAnchor(req, scen)}`;
    },

    async load(ctx) {
      const anchors = new Map();
      for (const spec of ctx.specs) {
        for (const req of spec.requirements) {
          anchors.set(`${spec.id}:${req.slug}`, ctx.links.requirement(spec.id, req.slug));
          for (const scen of req.scenarios) {
            anchors.set(scenKey(spec, req, scen), ctx.links.scenario(spec.id, req.slug, scen.slug));
          }
        }
      }
      const coverage = options.coverage ? await options.coverage(ctx) : null;
      ctx.data.reader = {
        anchors,
        coverage,
        ids: new Set(ctx.specs.map((s) => s.id)),
      };
    },

    cards(ctx) {
      if (!data(ctx).coverage) return [];
      let all = 0;
      let covered = 0;
      for (const spec of ctx.specs) {
        const st = specStats(spec, ctx);
        all += st.scens;
        covered += st.covered;
      }
      return [{
        title: 'Scenarios with tests',
        value: `${covered}/${all}`,
        note: `${all - covered} with no test`,
        link: base,
        tone: covered === all ? 'ok' : 'warn',
      }];
    },

    pages(ctx) {
      const pages = [{ path: `${base.slice(1)}index.md`, content: indexPage(ctx) }];
      for (const spec of ctx.specs) {
        pages.push({ path: `${base.slice(1)}${spec.id}/index.md`, content: renderSpec(spec, ctx) });
      }
      const tree = buildTree(ctx.specs.map((s) => s.id));
      const addAreas = (node) => {
        for (const child of node.children.values()) {
          if (child.children.size > 0 && !child.isCap) {
            pages.push({ path: `${base.slice(1)}${child.path}/index.md`, content: areaPage(child, ctx) });
          }
          addAreas(child);
        }
      };
      addAreas(tree);
      return pages;
    },

    nav: () => [{ text: 'Specs', link: base }],

    // The left sidebar has one link. The spec tree is in the right sidebar of
    // the spec pages (client/SpecTree.vue), in place of the page outline.
    sidebar: () => [{ text: 'Specs', link: base }],

    themeConfig(ctx) {
      const strip = (node) => ({
        name: node.name,
        path: node.path,
        cap: node.isCap,
        children: sortedChildren(node).map(strip),
      });
      return { base, tree: sortedChildren(buildTree(ctx.specs.map((s) => s.id))).map(strip) };
    },
  };
}

// --- coverage ---------------------------------------------------------------

function itemsOf(ctx, spec, req, scen) {
  const cov = ctx.data.reader.coverage;
  if (!cov) return null;
  const key = scenKey(spec, req, scen);
  return (cov instanceof Map ? cov.get(key) : cov[key]) || [];
}

function reqCoverage(spec, req, ctx) {
  const total = req.scenarios.length;
  const covered = req.scenarios.filter((s) => (itemsOf(ctx, spec, req, s) || []).some((it) => !it.missing)).length;
  return { total, covered };
}

function specStats(spec, ctx) {
  let scens = 0;
  let covered = 0;
  for (const req of spec.requirements) {
    const c = reqCoverage(spec, req, ctx);
    scens += c.total;
    covered += c.covered;
  }
  return { reqs: spec.requirements.length, scens, covered };
}

function coverageHtml(spec, req, scen, ctx) {
  const items = itemsOf(ctx, spec, req, scen);
  if (!items) return '';
  const merged = new Map();
  for (const it of items) {
    const key = `${it.kind}|${it.label}|${it.url || ''}`;
    const prev = merged.get(key);
    merged.set(key, { ...it, count: (prev?.count || 0) + 1 });
  }
  const rows = [...merged.values()].map((it) => {
    const text = it.code ? `<code>${esc(it.label)}</code>` : esc(it.label);
    const label = it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noreferrer">${text}</a>` : text;
    return (
      `<li><span class="kind kind-${esc(it.kind)}">${esc(it.kind)}</span> ${label}` +
      `${it.count > 1 ? ` <span class="count">×${it.count}</span>` : ''}` +
      `${it.note ? ` <span class="count">${esc(it.note)}</span>` : ''}` +
      `${it.missing ? ' <span class="missing">not found</span>' : ''}</li>`
    );
  });
  if (!items.some((it) => !it.missing)) {
    const list = rows.length ? `<ul>${rows.join('')}</ul>` : '';
    return `<div class="coverage uncovered"><span class="coverage-label">No tests cover this scenario</span>${list}</div>`;
  }
  return `<div class="coverage covered"><span class="coverage-label">Covered by</span><ul>${rows.join('')}</ul></div>`;
}

// --- inline links -------------------------------------------------------------

// linkCode(code, ctx) -> markdown for one inline code span.
function linkCode(code, ctx) {
  const md = `\`${code}\``;
  const d = ctx.data.reader;
  if (d.ids.has(code)) return `[${md}](${ctx.links.spec(code)})`;
  const ref = code.startsWith('spec:') ? code.slice(5) : code;
  if (d.anchors.has(ref)) return `[${md}](${d.anchors.get(ref)})`;
  if (/^[\w.-]+(\/[\w. -]+)+\/?$/.test(code) && existsSync(join(ctx.root, code))) {
    const url = ctx.fileUrl(code);
    if (url) return `[${md}](${url})`;
  }
  return md;
}

// inline(line, ctx) escapes `<` outside code spans (raw HTML is on, and spec
// text such as `<seat` must stay text), and links the code spans.
export function inline(line, ctx) {
  return line
    .split(/(`[^`]+`)/)
    .map((part, i) => (i % 2 === 1 ? linkCode(part.slice(1, -1), ctx) : part.replace(/</g, '&lt;')))
    .join('');
}

// --- spec page ----------------------------------------------------------------

// flushReq(st, spec, ctx) writes the requirement blocks once, if they are pending.
function flushReq(st, spec, ctx) {
  if (!st.reqPending) return;
  st.reqPending = false;
  const html = ctx.call('reader:requirement', { spec, req: st.req }).join('');
  if (html) st.out.push('', html, '');
}

// flushScenario(st, spec, ctx) writes the coverage and the blocks of the open scenario.
function flushScenario(st, spec, ctx) {
  if (!st.scen) return;
  const html = [coverageHtml(spec, st.req, st.scen, ctx), ...ctx.call('reader:scenario', { spec, req: st.req, scen: st.scen })].join('');
  if (html) st.out.push('', html, '');
  st.scen = null;
}

// reqBadge(spec, req, ctx) -> the lines of the coverage badge of a requirement.
function reqBadge(spec, req, ctx) {
  const { total, covered } = reqCoverage(spec, req, ctx);
  const cls = total === 0 ? 'none' : covered === total ? 'full' : 'part';
  return ['', `<div class="req-badge req-${cls}">${covered}/${total} scenarios covered</div>`, ''];
}

// openRequirement(line, st, spec, ctx) -> true if the line starts a requirement.
function openRequirement(line, st, spec, ctx) {
  if (!/^### Requirement:\s*(.+)$/.test(line)) return false;
  st.reqIdx += 1;
  st.scenIdx = -1;
  st.req = spec.requirements[st.reqIdx];
  st.reqPending = true;
  st.out.push(`### Requirement: ${inline(st.req.name, ctx)} {#${st.req.slug}}`);
  if (ctx.data.reader.coverage) st.out.push(...reqBadge(spec, st.req, ctx));
  return true;
}

// openScenario(line, st, ctx) -> true if the line starts a scenario of the open requirement.
function openScenario(line, st, ctx) {
  if (!/^#### Scenario:\s*(.+)$/.test(line) || !st.req) return false;
  st.scenIdx += 1;
  st.scen = st.req.scenarios[st.scenIdx];
  st.out.push(`#### Scenario: ${inline(st.scen.name, ctx)} {#${scenAnchor(st.req.slug, st.scen.slug)}}`);
  return true;
}

// renderLine(raw, st, spec, ctx) writes one line of spec text to st.out.
function renderLine(raw, st, spec, ctx) {
  const line = raw.trimEnd();
  const fence = /^\s*(```|~~~)/.test(line);
  if (fence) st.inFence = !st.inFence;
  if (fence || st.inFence) {
    st.out.push(line);
    return;
  }
  if (st.req && ctx.call('reader:hideLine', line, { spec, req: st.req }).length) {
    if (!st.scen) flushReq(st, spec, ctx);
    return;
  }
  if (COMMENT_LINE.test(line)) return;
  if (/^#{1,6}\s/.test(line)) {
    flushScenario(st, spec, ctx);
    if (/^#### Scenario:/.test(line) || /^#{1,3}\s/.test(line)) flushReq(st, spec, ctx);
  }
  if (openRequirement(line, st, spec, ctx) || openScenario(line, st, ctx)) return;
  if (/^#{1,2}\s/.test(line)) st.req = null;
  st.out.push(inline(line, ctx));
}

// renderSpec(spec, ctx) -> page markdown. It walks the same headings as the
// core parser and matches them to the parsed requirements by order.
function renderSpec(spec, ctx) {
  const st = { out: [], reqIdx: -1, scenIdx: -1, req: null, scen: null, inFence: false, reqPending: false };
  for (const raw of spec.text.split('\n')) renderLine(raw, st, spec, ctx);
  flushScenario(st, spec, ctx);
  flushReq(st, spec, ctx);

  const reqs = spec.requirements.map((r) => [r.slug, r.name.replace(/`/g, '')]);
  const front = ['---', `title: ${JSON.stringify(spec.id)}`, ...treeFront(spec.id), `stReqs: ${JSON.stringify(reqs)}`, '---', ''];
  return [...front, '::: v-pre', ...st.out, '', ':::', ''].join('\n');
}

// --- tree, sidebar, index pages ----------------------------------------------

// treeFront(id) -> front matter lines: the right sidebar shows the spec tree
// (with `id` in focus) in place of the page outline.
const treeFront = (id) => ['outline: false', 'stSpecTree: true', `stSpec: ${JSON.stringify(id)}`];

function buildTree(ids) {
  const root = { name: '', path: '', children: new Map(), isCap: false };
  for (const id of ids) {
    let node = root;
    const parts = id.split('/');
    parts.forEach((part, i) => {
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part, path: parts.slice(0, i + 1).join('/'), children: new Map(), isCap: false,
        });
      }
      node = node.children.get(part);
    });
    node.isCap = true;
  }
  return root;
}

const sortedChildren = (node) => [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));

function statsTable(specs, ctx) {
  const cov = !!ctx.data.reader.coverage;
  const lines = cov
    ? ['| Capability | Requirements | Scenarios | Covered |', '|---|---|---|---|']
    : ['| Capability | Requirements | Scenarios |', '|---|---|---|'];
  for (const spec of specs) {
    const st = specStats(spec, ctx);
    const cells = [`[\`${spec.id}\`](${ctx.links.spec(spec.id)})`, st.reqs, st.scens];
    if (cov) cells.push(st.covered);
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines;
}

function indexPage(ctx) {
  let reqs = 0;
  let scens = 0;
  let covered = 0;
  for (const spec of ctx.specs) {
    const st = specStats(spec, ctx);
    reqs += st.reqs;
    scens += st.scens;
    covered += st.covered;
  }
  const cov = ctx.data.reader.coverage ? ` (${covered} covered by tests)` : '';
  return [
    '---', 'title: Specs', ...treeFront(''), '---', '', '::: v-pre', '# Specs', '',
    'These pages show `openspec/specs/`. The spec files are the source of truth. Do not edit these pages.', '',
    `- Capabilities: ${ctx.specs.length}`,
    `- Requirements: ${reqs}`,
    `- Scenarios: ${scens}${cov}`,
    '',
    ...statsTable(ctx.specs, ctx),
    '', ':::', '',
  ].join('\n');
}

function areaPage(node, ctx) {
  const caps = [];
  const collect = (n) => {
    if (n.isCap) caps.push(n.path);
    sortedChildren(n).forEach(collect);
  };
  sortedChildren(node).forEach(collect);
  const specs = caps.map((id) => ctx.specs.find((s) => s.id === id));
  const lines = ['---', `title: ${JSON.stringify(node.path)}`, ...treeFront(node.path), '---', '', '::: v-pre', `# ${node.path}/`, ''];
  lines.push(...statsTable(specs, ctx), '');
  for (const spec of specs) {
    lines.push(`## [\`${spec.id}\`](${ctx.links.spec(spec.id)}) {#${slugify(spec.id)}}`, '', inline(spec.purpose, ctx), '');
  }
  lines.push(':::', '');
  return lines.join('\n');
}

export default reader;

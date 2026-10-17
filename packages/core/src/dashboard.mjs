// The home page: the web version of `openspec view`, plus the plugin cards.
import { esc } from './util.mjs';

const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0);

function card({ title, value, note = '', link = null, tone = '' }) {
  const body =
    `<div class="st-card-title">${esc(title)}</div>` +
    `<div class="st-card-value">${esc(value)}</div>` +
    (note ? `<div class="st-card-note">${esc(note)}</div>` : '');
  const cls = `st-card${tone ? ` st-${tone}` : ''}`;
  return link ? `<a class="${cls}" href="${esc(link)}">${body}</a>` : `<div class="${cls}">${body}</div>`;
}

function progress(done, total) {
  const p = pct(done, total);
  return (
    `<span class="st-progress"><span class="st-bar"><span style="width:${p}%"></span></span>` +
    `<span class="st-progress-text">${done}/${total} (${p}%)</span></span>`
  );
}

function changeRows(changes) {
  const rows = changes.map((c) => {
    const arts = (c.artifacts || [])
      .map((a) => `<span class="st-art st-art-${esc(a.status)}">${esc(a.id)}${a.status === 'done' ? ' ✓' : ''}</span>`)
      .join(' ');
    return (
      `<tr><td><code>${esc(c.name)}</code></td><td>${progress(c.completedTasks, c.totalTasks)}</td>` +
      `<td>${c.schema ? `<span class="st-schema">${esc(c.schema)}</span> ` : ''}${arts}</td></tr>`
    );
  });
  return `<table class="st-changes"><thead><tr><th>Change</th><th>Tasks</th><th>Artifacts</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

// dashboardPage(ctx, cards) -> markdown of the home page.
export function dashboardPage(ctx, cards) {
  const { changes, specs } = ctx.openspec;
  const draft = changes.filter((c) => c.status === 'no-tasks');
  const active = changes.filter((c) => c.status === 'in-progress');
  const complete = changes.filter((c) => c.status === 'complete');
  const reqs = specs.reduce((n, s) => n + (s.requirementCount || 0), 0);
  const tasksDone = changes.reduce((n, c) => n + (c.completedTasks || 0), 0);
  const tasksAll = changes.reduce((n, c) => n + (c.totalTasks || 0), 0);

  const summary = [
    card({ title: 'Specifications', value: specs.length, note: `${reqs} requirements`, link: ctx.links.spec('') }),
    card({ title: 'Active changes', value: active.length, note: draft.length ? `${draft.length} draft` : 'in progress' }),
    card({ title: 'Completed changes', value: complete.length, note: 'all tasks done, not archived' }),
    card({ title: 'Task progress', value: `${pct(tasksDone, tasksAll)}%`, note: `${tasksDone}/${tasksAll} tasks` }),
  ];

  const lines = [
    '---', `title: ${JSON.stringify(ctx.config.title)}`, 'aside: false', '---', '', '::: v-pre',
    `# ${esc(ctx.config.title)}`, '',
    `<div class="st-cards">${summary.join('')}</div>`, '',
  ];
  if (cards.length) {
    lines.push('## Plugins {#plugins}', '', `<div class="st-cards">${cards.map(card).join('')}</div>`, '');
  }
  const section = (title, id, list) => {
    if (list.length) lines.push(`## ${title} {#${id}}`, '', changeRows(list), '');
  };
  section('Draft changes', 'draft-changes', draft);
  section('Active changes', 'active-changes', active);
  section('Completed changes', 'completed-changes', complete);
  if (!changes.length) lines.push('## Changes {#changes}', '', 'No active changes.', '');

  lines.push('## Specifications {#specifications}', '');
  const rows = [...specs]
    .sort((a, b) => b.requirementCount - a.requirementCount || a.id.localeCompare(b.id))
    .map((s) => {
      const url = ctx.links.spec(s.id);
      const name = url ? `<a href="${esc(url)}"><code>${esc(s.id)}</code></a>` : `<code>${esc(s.id)}</code>`;
      return `<tr><td>${name}</td><td>${s.requirementCount}</td></tr>`;
    });
  lines.push(
    `<table class="st-specs"><thead><tr><th>Spec</th><th>Requirements</th></tr></thead><tbody>${rows.join('')}</tbody></table>`,
    '', ':::', '',
  );
  return lines.join('\n');
}

// The OpenSpec spec parser. Plugins read the parsed specs from `ctx.specs`;
// do not write a second parser in a plugin.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { slugify } from './util.mjs';

// parseSpec(text) -> { purpose, requirements: [{ name, slug, lines, scenarios:
//   [{ name, slug, lines }] }] }
// `### Requirement: X` opens a requirement. `#### Scenario: Y` opens a scenario.
// A level-1 or level-2 heading closes the requirement.
// req.lines holds the lines of the requirement before its first scenario.
// scen.lines holds the lines of the scenario. Fenced code stays as text.
export function parseSpec(text) {
  const requirements = [];
  let req = null;
  let scen = null;
  let inFence = false;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence) {
      const r = line.match(/^### Requirement:\s*(.+)$/);
      if (r) {
        req = { name: r[1].trim(), slug: slugify(r[1].trim()), lines: [], scenarios: [] };
        requirements.push(req);
        scen = null;
        continue;
      }
      const s = line.match(/^#### Scenario:\s*(.+)$/);
      if (s && req) {
        scen = { name: s[1].trim(), slug: slugify(s[1].trim()), lines: [] };
        req.scenarios.push(scen);
        continue;
      }
      if (/^#{1,2}\s/.test(line)) {
        req = null;
        scen = null;
        continue;
      }
    }
    if (scen) scen.lines.push(line);
    else if (req) req.lines.push(line);
  }
  return { purpose: purposeOf(text), requirements };
}

function purposeOf(text) {
  // `(?![\s\S])` is the end of the text; `$` with the m flag is the end of a line.
  const m = text.match(/^## Purpose\s*\n+([\s\S]*?)(\n\s*\n|(?![\s\S]))/m);
  return m ? m[1].replace(/\s*\n\s*/g, ' ').trim() : '';
}

// loadSpecs(specsDir) -> [{ id, file, text, purpose, requirements }], sorted by id.
// The id is the folder path under specs/, with `/`. This is the same id the
// OpenSpec CLI uses, for example `mobile/ui/game`.
export function loadSpecs(specsDir) {
  const out = [];
  const visit = (dir, parts) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (!statSync(full).isDirectory()) continue;
      const file = join(full, 'spec.md');
      const id = [...parts, entry].join('/');
      if (existsSync(file)) {
        const text = readFileSync(file, 'utf8');
        out.push({ id, file, text, ...parseSpec(text) });
      }
      visit(full, [...parts, entry]);
    }
  };
  visit(specsDir, []);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// The tag key of a requirement or a scenario: `cap:req-slug[:scen-slug]`.
export const reqKey = (spec, req) => `${spec.id}:${req.slug}`;
export const scenKey = (spec, req, scen) => `${spec.id}:${req.slug}:${scen.slug}`;

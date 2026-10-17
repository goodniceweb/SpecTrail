// Reads a project dictionary in markdown. Two forms give bans:
//
// 1. Entries in a list, grouped by `##` sections:
//      - **seat** — a numbered position that holds a player. Do not use: slot (for seats).
//    The entry can wrap to more lines. "Do not use: a, b (limit)." gives the bans.
// 2. A table whose first header cell starts with "Do not write" or "Do not use":
//      | Do not write | Write instead |
//      | participant, member, user | player |
//
// A ban with a limit in parentheses ("slot (for seats)") applies only in one
// sense. A text search cannot see the sense, so such a ban is "contextual":
// the plugin reports it for a person to review, never as an error. A limit at
// the end of a list applies to every word of the list.

// splitList("a, b (x, y), c") -> ['a', 'b (x, y)', 'c']: commas outside parentheses.
function splitList(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// expand('terminal/fatal error screen') -> ['terminal error screen', 'fatal error screen']
// expand('development card / deck') -> ['development card', 'development deck']
function expand(phrase) {
  const spaced = phrase.split(/\s+\/\s+/);
  if (spaced.length > 1) {
    const [first, ...rest] = spaced;
    const words = first.split(/\s+/);
    const prefix = words.slice(0, -1).join(' ');
    return [first, ...rest.map((r) => (r.split(/\s+/).length === 1 && prefix ? `${prefix} ${r}` : r))].flatMap(expand);
  }
  const words = phrase.split(/\s+/);
  const i = words.findIndex((w) => /^[^/]+\/[^/]+$/.test(w) && !/^\w+:\/\//.test(w));
  if (i < 0) return [phrase];
  return words[i].split('/').flatMap((alt) => expand([...words.slice(0, i), alt, ...words.slice(i + 1)].join(' ')));
}

// parseBans("a, b (for x)") -> [{ word, limit }]
function parseBans(list) {
  const items = splitList(list.replace(/\.\s*$/, ''));
  const limitOf = (item) => item.match(/\(([^()]*)\)\s*$/)?.[1].trim() || null;
  const last = items.length > 1 ? limitOf(items[items.length - 1]) : null;
  const shared = last && items.slice(0, -1).every((it) => !limitOf(it)) ? last : null;
  const out = [];
  for (const item of items) {
    const limit = limitOf(item) || shared;
    const bare = item.replace(/\([^()]*\)\s*$/, '').replace(/^(the|a|an)\s+/i, '').replace(/["“”]/g, '').trim();
    if (!bare) continue;
    for (const word of expand(bare)) out.push({ word: word.trim(), limit });
  }
  return out;
}

const wordRe = (w) =>
  new RegExp(`(?<![\\p{L}\\p{N}_-])${w.split(/\s+/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}s?(?![\\p{L}\\p{N}_-])`, 'iu');

// uniqueInstead(['current player', 'the current player / the player who ...'])
//   -> ['current player', 'the player who ...']
function uniqueInstead(list) {
  const seen = new Set();
  const out = [];
  for (const item of list.flatMap((x) => x.split(/\s+\/\s+/))) {
    const key = item.trim().toLowerCase().replace(/^(the|a|an)\s+/, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

const cells = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

// closeEntry(st) ends the open list entry and adds it to the open section.
function closeEntry(st) {
  const entry = st.entry;
  if (!entry) return;
  entry.definition = entry.definition.replace(/\s+/g, ' ').trim();
  const ban = entry.definition.match(/Do not\s+use:\s*([^.]*(?:\.[^\s][^.]*)*)\./i);
  entry.bans = ban ? parseBans(ban[1]) : [];
  st.section.entries.push(entry);
  st.entry = null;
}

// endSection(st) adds the open section to the list, if it has a title or entries.
function endSection(st) {
  if (st.section.entries.length || st.section.title) st.sections.push(st.section);
}

// readTableLine(st, line) reads one line of a table; only the ban tables are kept.
function readTableLine(st, line) {
  closeEntry(st);
  const c = cells(line);
  if (!st.table) {
    if (/^do not (write|use)/i.test(c[0])) {
      st.table = { section: st.section.title, header: c, rows: [] };
      st.tables.push(st.table);
    }
    return;
  }
  if (c.every((x) => /^:?-+:?$/.test(x))) return;
  st.table.rows.push({ bans: parseBans(c[0]), instead: c[1] || '' });
}

// readLine(st, line) reads one line of the dictionary into the parser state.
function readLine(st, line) {
  const head = line.match(/^##\s+(.+)$/);
  if (head) {
    closeEntry(st);
    st.table = null;
    endSection(st);
    st.section = { title: head[1].trim(), entries: [] };
    return;
  }
  if (/^\s*\|/.test(line)) {
    readTableLine(st, line);
    return;
  }
  st.table = null;
  const item = line.match(/^- \*\*(.+?)\*\*\s*(\([^)]*\))?\s*(?:—|–|-{1,2})\s*(.*)$/);
  if (item) {
    closeEntry(st);
    st.entry = { term: item[1].trim(), note: item[2] ? item[2].slice(1, -1) : null, definition: item[3] };
  } else if (st.entry && /^\s+\S/.test(line)) {
    st.entry.definition += ` ${line.trim()}`;
  } else {
    closeEntry(st);
  }
}

// addRule(rules, ban, instead, source) adds one ban to the map of rules, one rule for each word.
function addRule(rules, ban, instead, source) {
  const key = ban.word.toLowerCase();
  if (!rules.has(key)) rules.set(key, { word: ban.word, limits: [], plain: false, instead: [], sources: [] });
  const r = rules.get(key);
  if (!ban.limit) r.plain = true;
  else if (!r.limits.includes(ban.limit)) r.limits.push(ban.limit);
  if (instead && !r.instead.includes(instead)) r.instead.push(instead);
  if (!r.sources.includes(source)) r.sources.push(source);
}

// collectRules(sections, tables) -> Map of the rules from the entries and the tables.
function collectRules(sections, tables) {
  const rules = new Map();
  for (const s of sections) {
    for (const e of s.entries) for (const b of e.bans) addRule(rules, b, e.term, s.title);
  }
  for (const t of tables) {
    for (const row of t.rows) for (const b of row.bans) addRule(rules, b, row.instead, t.section);
  }
  return rules;
}

// ruleList(rules, sections) -> the final rules, sorted by word.
function ruleList(rules, sections) {
  // The text of the definitions without the ban sentences. If the dictionary
  // itself uses a banned word there, the word has other, approved senses.
  const prose = sections
    .flatMap((s) => s.entries.map((e) => e.definition))
    .join('\n')
    .replace(/Do not\s+use:[^.]*\./gi, ' ')
    .replace(/"[^"]*"|“[^”]*”|`[^`]*`/g, ' ');
  const list = [...rules.values()].map((r) => {
    const usedElsewhere = wordRe(r.word).test(prose);
    const limits = [...r.limits];
    if (usedElsewhere) limits.push('the dictionary uses this word in another sense');
    return {
      word: r.word,
      // A ban is hard only when no source limits it to one sense and the
      // dictionary never uses the word in its own text.
      contextual: limits.length > 0,
      limits,
      instead: uniqueInstead(r.instead),
      sources: r.sources,
    };
  });
  return list.sort((a, b) => a.word.localeCompare(b.word));
}

// parseDictionary(text) -> { title, sections: [{ title, entries: [{ term, note, definition, bans }] }],
//   tables: [{ section, rows: [{ bans, instead }] }], rules }
// rules: one per banned word: { word, contextual, limits: [string], instead: [string], sources: [string] }
export function parseDictionary(text) {
  const st = { sections: [], tables: [], section: { title: '', entries: [] }, entry: null, table: null };
  const title = text.match(/^#\s+(.+)$/m)?.[1].trim() || 'Dictionary';
  for (const line of text.split('\n')) readLine(st, line);
  closeEntry(st);
  endSection(st);
  return {
    title,
    sections: st.sections.filter((s) => s.entries.length),
    tables: st.tables,
    rules: ruleList(collectRules(st.sections, st.tables), st.sections),
  };
}

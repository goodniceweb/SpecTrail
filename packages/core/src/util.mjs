// Small helpers that the core and the plugins share.
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

// esc(s) -> s, safe to put in HTML text and in a quoted attribute.
export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// slugify(s) -> the anchor slug that OpenSpec tags use (`cap:req-slug:scen-slug`).
export const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const logger = (name) => (...args) => console.log(`[${name}]`, ...args);

// writeIfChanged(path, content) -> true when it wrote the file. An unchanged
// file keeps its mtime, so the dev server does not reload the page.
export function writeIfChanged(path, content) {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return true;
}

// listFiles(dir, skip) -> every file under dir. skip(fullPath) skips a file or a folder.
export function listFiles(dir, skip = () => false) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (skip(full)) continue;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, skip));
    else out.push(full);
  }
  return out;
}

// syncDir(from, to, match) copies the matching files and removes the others from `to`.
export function syncDir(from, to, match = () => true) {
  const wanted = new Set();
  for (const src of listFiles(from, (f) => f.endsWith('.tmp'))) {
    if (!match(src)) continue;
    const dst = join(to, relative(from, src));
    wanted.add(dst);
    const s = statSync(src);
    if (existsSync(dst)) {
      const d = statSync(dst);
      if (d.size === s.size && d.mtimeMs >= s.mtimeMs) continue;
    }
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
  for (const f of listFiles(to)) if (!wanted.has(f)) rmSync(f);
}

// globToRegExp('mobile/ui/**') -> RegExp. `**` matches any depth, `*` one segment.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i += 1;
      if (glob[i + 1] === '/') {
        // `**/x` matches `x` and `a/b/x`.
        re += '(?:.*/)?';
        i += 1;
      } else if (re.endsWith('/')) {
        // `a/**` matches `a` and everything under it.
        re = `${re.slice(0, -1)}(?:/.*)?`;
      } else {
        re += '.*';
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export const matchesAny = (value, globs) => globs.some((g) => globToRegExp(g).test(value));

// debounced(fn, ms) -> a function that runs fn once after the calls stop.
// An editor save can fire several file events.
export function debounced(fn, ms = 300) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

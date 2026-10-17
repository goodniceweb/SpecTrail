// Exports the screens of the selected <designDir>/*.pen files to WebP with
// the pen CLI. A screen is a top-level frame that is not a reusable component
// and has a fixed width of at least `minWidth` px (a phone screen, a web page,
// a full dialog frame). Components, icons, and loose parts are not screens:
// they have no meaning out of context. `include` names more node ids to export. Output: <outDir>/<pen basename>/<id>.webp and
// <outDir>/screens.json ({ sources, screens: [{ file, id, name, width, height }] }).
// The export skips a file when the file and the .lib.pen files did not change.
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { logger, matchesAny } from '@spectrail/core';

// Change this when the export settings change, so the next run exports again.
const EXPORT_VERSION = 'webp-q85-s2-v2';
const SCALE = 2;
const QUALITY = 85;
const MARK = 'SCREENS_JSON:';

const log = logger('pen');

export const manifestFile = (outDir) => join(outDir, 'screens.json');

export function penFiles(designDir) {
  if (!existsSync(designDir)) return [];
  return readdirSync(designDir).filter((f) => f.endsWith('.pen')).sort();
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

// A screen in one .pen file can use components from a .lib.pen file, so the
// fingerprint of a file also holds the hashes of every library file.
function fingerprints(designDir, files, all, rule) {
  const libs = all.filter((f) => f.endsWith('.lib.pen'));
  const libHash = libs.map((f) => `${f}=${sha256(join(designDir, f))}`).join(';');
  const out = {};
  for (const f of files) {
    out[f] = createHash('sha256')
      .update(`${EXPORT_VERSION};${JSON.stringify(rule)};${sha256(join(designDir, f))};${libHash}`)
      .digest('hex');
  }
  return out;
}

export function readManifest(outDir) {
  try {
    return JSON.parse(readFileSync(manifestFile(outDir), 'utf8'));
  } catch {
    return { sources: {}, screens: [] };
  }
}

// penBin(root, cli, dirs) -> the path of the pen CLI script. `cli` (from the
// plugin options) wins; then the copy in the project; then the copies in
// `dirs` (the folder of the config file); then the copy next to this package.
export function penBin(root, cli = null, dirs = []) {
  if (cli) return cli;
  for (const from of [join(root, 'package.json'), ...dirs.map((d) => join(d, 'package.json')), import.meta.url]) {
    try {
      const pkgFile = createRequire(from).resolve('@pen.dev/cli/package.json');
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.pen;
      if (bin) return join(dirname(pkgFile), bin);
    } catch {
      // Try the next place.
    }
  }
  return null;
}

// The key comes from PEN_CLI_KEY. On macOS it falls back to the Keychain
// entry `pen-cli-key`. The key goes only into the child env. Never log it.
function penEnv() {
  const env = { ...process.env };
  if (!env.PEN_CLI_KEY && process.platform === 'darwin') {
    try {
      const key = execFileSync('security', ['find-generic-password', '-s', 'pen-cli-key', '-w'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (key) env.PEN_CLI_KEY = key;
    } catch {
      // No Keychain entry: the CLI can still use a `pen login` session.
    }
  }
  return env;
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const redact = (s, env) => (env.PEN_CLI_KEY ? s.split(env.PEN_CLI_KEY).join('<key>') : s);

function checkAuth(bin, env) {
  const res = spawnSync(process.execPath, [bin, 'status'], { env, encoding: 'utf8', timeout: 60_000 });
  const out = stripAnsi(`${res.stdout || ''}${res.stderr || ''}`);
  if (/expired|revoked|not logged in|not authenticated|invalid/i.test(out) || res.status !== 0) {
    const status = out.match(/expired \/ revoked|expired|revoked|not logged in|not authenticated|invalid/i)?.[0] || 'unknown';
    console.warn(
      `[pen] WARNING: pen CLI auth is not valid (status: ${status}).\n` +
        '  The export may still work (the CLI fails open), but it can stop at any time.\n' +
        '  Create a new key at pen.dev (org settings, Developer Keys), then run:\n' +
        '  security add-generic-password -U -a $USER -s pen-cli-key -w',
    );
  }
}

// runPen(bin, path, env, calls) -> the output of one headless pen session with
// one `execute` call for each item of `calls`. Each call has a time limit
// (55 s in pen 0.3), so large exports go in batches.
function runPen(bin, path, env, calls) {
  const input = `${calls.map((code) => `execute({ input: ${JSON.stringify(code)} })`).join('\n')}\nexit()\n`;
  const scratch = join(tmpdir(), `spectrail-${process.pid}-${basename(path)}`);
  const res = spawnSync(process.execPath, [bin, 'interactive', '-i', path, '-o', scratch], {
    env,
    input,
    encoding: 'utf8',
    timeout: 1_800_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  rmSync(scratch, { force: true });
  return stripAnsi(`${res.stdout || ''}\n${res.stderr || ''}`);
}

// listScreens(bin, path, env, rule) -> [{ id, name, type, width, height }]
// Ids with ':' come from an imported library; the library file has them itself.
function listScreens(bin, path, env, rule) {
  const code = [
    'const list = [];',
    `const MIN = ${Number(rule.minWidth)};`,
    `const INCLUDE = ${JSON.stringify(rule.include)};`,
    'Get(document, (n, c) => {',
    '  if (c.depth === 1) {',
    '    const id = String(n.id);',
    '    const screen = n.type === "frame" && !n.reusable && typeof n.width === "number" && n.width >= MIN;',
    '    if (!id.includes(":") && (screen || INCLUDE.includes(id))) {',
    '      list.push({ id: n.id, name: n.name || n.id, type: n.type, width: n.width, height: n.height });',
    '    }',
    '    c.skipChildren();',
    '  }',
    '});',
    `Print("${MARK}" + JSON.stringify(list));`,
  ].join(' ');
  const out = runPen(bin, path, env, [code]);
  const line = out.split('\n').find((l) => l.includes(MARK));
  if (!line) throw new Error(`pen CLI gave no screen list for ${basename(path)}:\n${redact(out, env).slice(-3000)}`);
  return JSON.parse(line.slice(line.indexOf(MARK) + MARK.length).trim());
}

// About 30 phone screens or 8 web pages at scale 2 fit in one call.
const BATCH_PIXELS = 10_000_000;

// exportBatches(bin, path, outDir, env, list) exports the screens, batch by batch.
function exportBatches(bin, path, outDir, env, list) {
  const batches = [];
  let cur = [];
  let px = 0;
  for (const s of list) {
    const w = typeof s.width === 'number' ? s.width : 400;
    const h = typeof s.height === 'number' ? s.height : w * 2;
    const cost = w * h;
    if (cur.length && px + cost > BATCH_PIXELS) {
      batches.push(cur);
      cur = [];
      px = 0;
    }
    cur.push(s.id);
    px += cost;
  }
  if (cur.length) batches.push(cur);
  const calls = batches.map(
    (ids) => `Export(${JSON.stringify(ids)}, "webp", ${JSON.stringify(outDir)}, { scale: ${SCALE}, quality: ${QUALITY} });`,
  );
  if (calls.length) return { out: runPen(bin, path, env, calls), batches: batches.length };
  return { out: '', batches: 0 };
}

// webpSize(buffer) -> { width, height } from the VP8X / VP8 / VP8L header.
export function webpSize(buf) {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  throw new Error('not a WebP file');
}

// exportScreens({ root, designDir, outDir, files, minWidth, include, force }) -> { changed, manifest }
// `files` are globs of .pen file names; the default skips the `.lib.pen` libraries.
export function exportScreens({
  root, designDir, outDir, cli = null, dirs = [], force = false,
  files: globs = null, minWidth = 320, include = [],
}) {
  const all = penFiles(designDir);
  const files = all.filter((f) => (globs ? matchesAny(f, globs) : !f.endsWith('.lib.pen')));
  const rule = { minWidth, include };
  const prints = fingerprints(designDir, files, all, rule);
  const old = readManifest(outDir);
  const stale = files.filter(
    (f) => force || old.sources?.[f] !== prints[f] || !existsSync(join(outDir, f.replace(/\.pen$/, ''))),
  );
  const removed = Object.keys(old.sources || {}).filter((f) => !files.includes(f));

  if (stale.length === 0 && removed.length === 0) {
    log('screens are up to date');
    return { changed: false, manifest: old };
  }

  const bin = penBin(root, cli, dirs);
  if (stale.length && !bin) {
    throw new Error('The pen CLI is not installed. Run: npm i -D @pen.dev/cli');
  }
  const env = penEnv();
  if (stale.length) checkAuth(bin, env);
  mkdirSync(outDir, { recursive: true });

  const sources = { ...(old.sources || {}) };
  let screens = (old.screens || []).filter((s) => files.includes(s.file) && !stale.includes(s.file));
  for (const f of removed) {
    delete sources[f];
    rmSync(join(outDir, f.replace(/\.pen$/, '')), { recursive: true, force: true });
  }

  for (const file of stale) {
    const finalDir = join(outDir, file.replace(/\.pen$/, ''));
    const tmpDir = `${finalDir}.tmp`;
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
    log(`exporting ${file} ...`);
    const list = listScreens(bin, join(designDir, file), env, rule);
    const { out, batches } = exportBatches(bin, join(designDir, file), tmpDir, env, list);

    // The CLI can fail without a nonzero exit code, so check every file.
    const missing = list.filter((s) => !existsSync(join(tmpDir, `${s.id}.webp`)));
    if (missing.length) {
      throw new Error(
        `${file}: ${missing.length} screens not exported (${batches} batches): ${missing.map((s) => s.id).join(', ')}\n` +
          redact(out, env).slice(-2000),
      );
    }
    for (const s of list) {
      const { width, height } = webpSize(readFileSync(join(tmpDir, `${s.id}.webp`)));
      screens.push({
        file, id: s.id, name: s.name, width: Math.round(width / SCALE), height: Math.round(height / SCALE),
      });
    }
    rmSync(finalDir, { recursive: true, force: true });
    renameSync(tmpDir, finalDir);
    sources[file] = prints[file];
    log(`exported ${list.length} screens from ${file}`);
  }

  // Keep the order of the files and of the screens inside each file.
  screens = files.flatMap((f) => screens.filter((s) => s.file === f));
  const manifest = { sources, screens };
  writeFileSync(manifestFile(outDir), `${JSON.stringify(manifest, null, 2)}\n`);
  return { changed: true, manifest };
}

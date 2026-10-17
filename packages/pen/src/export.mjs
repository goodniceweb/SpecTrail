// Exports every top-level node (except text) of each <designDir>/*.pen file to
// WebP with the pen CLI. Output: <outDir>/<pen basename>/<id>.webp and
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
import { logger } from '@spectrail/core';

// Change this when the export settings change, so the next run exports again.
const EXPORT_VERSION = 'webp-q85-s2-v1';
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
function fingerprints(designDir, files) {
  const libs = files.filter((f) => f.endsWith('.lib.pen'));
  const libHash = libs.map((f) => `${f}=${sha256(join(designDir, f))}`).join(';');
  const out = {};
  for (const f of files) {
    out[f] = createHash('sha256')
      .update(`${EXPORT_VERSION};${sha256(join(designDir, f))};${libHash}`)
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

// penBin(root, cli) -> the path of the pen CLI script. `cli` (from the
// plugin options) wins; then the copy in the project; then the copy next to this package.
export function penBin(root, cli = null) {
  if (cli) return cli;
  for (const from of [join(root, 'package.json'), import.meta.url]) {
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

// One pen session per file: list the top-level nodes, print them as JSON,
// then export them. Ids with ':' come from an imported library; the library
// file exports them itself.
function exportFile(bin, path, outDir, env) {
  const code = [
    'const list = [];',
    'Get(document, (n, c) => {',
    '  if (c.depth === 1) {',
    '    if (n.type !== "text" && !String(n.id).includes(":")) list.push({ id: n.id, name: n.name || n.id, type: n.type });',
    '    c.skipChildren();',
    '  }',
    '});',
    `Print("${MARK}" + JSON.stringify(list));`,
    `if (list.length) Export(list.map((s) => s.id), "webp", ${JSON.stringify(outDir)}, { scale: ${SCALE}, quality: ${QUALITY} });`,
  ].join(' ');
  const input = `execute({ input: ${JSON.stringify(code)} })\nexit()\n`;
  const scratch = join(tmpdir(), `spectrail-${process.pid}-${basename(path)}`);
  const res = spawnSync(process.execPath, [bin, 'interactive', '-i', path, '-o', scratch], {
    env,
    input,
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  rmSync(scratch, { force: true });
  const out = stripAnsi(`${res.stdout || ''}\n${res.stderr || ''}`);
  const line = out.split('\n').find((l) => l.includes(MARK));
  if (!line) {
    throw new Error(`pen CLI gave no screen list for ${basename(path)}:\n${redact(out, env).slice(-3000)}`);
  }
  return JSON.parse(line.slice(line.indexOf(MARK) + MARK.length).trim());
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

// exportScreens({ root, designDir, outDir, force }) -> { changed, manifest }
export function exportScreens({ root, designDir, outDir, cli = null, force = false }) {
  const files = penFiles(designDir);
  const prints = fingerprints(designDir, files);
  const old = readManifest(outDir);
  const stale = files.filter(
    (f) => force || old.sources?.[f] !== prints[f] || !existsSync(join(outDir, f.replace(/\.pen$/, ''))),
  );
  const removed = Object.keys(old.sources || {}).filter((f) => !files.includes(f));

  if (stale.length === 0 && removed.length === 0) {
    log('screens are up to date');
    return { changed: false, manifest: old };
  }

  const bin = penBin(root, cli);
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
    const list = exportFile(bin, join(designDir, file), tmpDir, env);

    // The CLI can fail without a nonzero exit code, so check every file.
    const missing = list.filter((s) => !existsSync(join(tmpDir, `${s.id}.webp`)));
    if (missing.length) {
      throw new Error(`${file}: ${missing.length} screens not exported: ${missing.map((s) => s.id).join(', ')}`);
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

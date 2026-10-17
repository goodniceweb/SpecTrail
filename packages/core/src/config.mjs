// Loads `spectrail.config.mjs` and fills in the defaults.
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONFIG_NAMES = ['spectrail.config.mjs', 'spectrail.config.js'];

// findConfig(path) -> the absolute path of the config file. It throws if there is none.
function findConfig(path) {
  const file = path ? resolve(path) : CONFIG_NAMES.map((n) => resolve(n)).find((f) => existsSync(f));
  if (!file || !existsSync(file)) {
    throw new Error(`No config file. Create ${CONFIG_NAMES[0]} in the project root, or use --config <file>.`);
  }
  return file;
}

// checkPlugins(plugins) throws if a plugin has no name or if a name is in the list two times.
function checkPlugins(plugins) {
  const names = new Set();
  for (const p of plugins) {
    if (!p.name) throw new Error('A plugin has no name.');
    if (names.has(p.name)) throw new Error(`The plugin "${p.name}" is in the config two times.`);
    names.add(p.name);
  }
}

// The config file is a module with a default export:
//   export default {
//     root: '.',                    // the project root; default: the folder of the config file
//     title: 'My specs',
//     openspecDir: 'openspec',
//     workDir: '.spectrail',        // generated files; add it to .gitignore
//     port: 5174,
//     repo: { url: 'https://github.com/org/repo', ref: 'main' },
//     plugins: [reader(), pen()],
//   };
export async function loadConfig(path) {
  const file = findConfig(path);
  const mod = await import(pathToFileURL(file).href);
  const raw = typeof mod.default === 'function' ? await mod.default() : mod.default;
  if (!raw || typeof raw !== 'object') throw new Error(`${file} has no default export.`);

  const base = dirname(file);
  const abs = (p, from) => (isAbsolute(p) ? p : resolve(from, p));
  const root = abs(raw.root || '.', base);
  const openspecDir = abs(raw.openspecDir || 'openspec', root);
  const workDir = abs(raw.workDir || '.spectrail', root);
  const plugins = (raw.plugins || []).flat().filter(Boolean);
  checkPlugins(plugins);

  return {
    file,
    root,
    title: raw.title || 'Specs',
    description: raw.description || 'OpenSpec specs and changes',
    openspecDir,
    specsDir: join(openspecDir, 'specs'),
    changesDir: join(openspecDir, 'changes'),
    workDir,
    siteDir: join(workDir, 'site'),
    distDir: join(workDir, 'dist'),
    cacheDir: join(workDir, 'cache'),
    port: Number(raw.port || 5174),
    repo: raw.repo ? { url: raw.repo.url.replace(/\/$/, ''), ref: raw.repo.ref || 'main' } : null,
    plugins,
  };
}

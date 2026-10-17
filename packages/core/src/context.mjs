// The context object that the core gives to each plugin function.
import { join } from 'node:path';
import { loadOpenspec } from './openspec.mjs';
import { loadSpecs } from './specs.mjs';
import { logger } from './util.mjs';

// createContext(config) -> ctx
//   ctx.config        the loaded config (see config.mjs)
//   ctx.root          the project root
//   ctx.specs         the parsed specs (see specs.mjs); set by refresh()
//   ctx.openspec      { changes, specs } from the OpenSpec CLI; set by refresh()
//   ctx.data[name]    free space for each plugin
//   ctx.links         URL makers; a plugin that makes pages can set them
//   ctx.fileUrl(p)    the repo URL of a file path, or null when the config has no repo
//   ctx.cacheDir(n)   a cache folder for one plugin
//   ctx.has(name)     true when the config has that plugin
//   ctx.call(hook, …) calls `hooks[hook]` of every plugin; returns the results that are not empty
export function createContext(config) {
  const ctx = {
    config,
    root: config.root,
    specs: [],
    openspec: { changes: [], specs: [] },
    data: {},
    links: {
      // spec(id), requirement(id, reqSlug), scenario(id, reqSlug, scenSlug) -> URL or null.
      // spec('') is the URL of the list of all specs.
      spec: () => null,
      requirement: () => null,
      scenario: () => null,
    },
    fileUrl(path) {
      if (!config.repo) return null;
      const clean = String(path).replace(/^\.?\//, '').replace(/\/$/, '');
      return `${config.repo.url}/blob/${config.repo.ref}/${clean.split('/').map(encodeURIComponent).join('/')}`;
    },
    cacheDir: (name) => join(config.cacheDir, name),
    has: (name) => config.plugins.some((p) => p.name === name),
    call(hook, ...args) {
      const out = [];
      for (const p of config.plugins) {
        const fn = p.hooks?.[hook];
        if (!fn) continue;
        const res = fn(...args, ctx);
        if (res !== undefined && res !== null && res !== false && res !== '') out.push(res);
      }
      return out;
    },
    log: logger('spectrail'),
    async refresh() {
      ctx.specs = loadSpecs(config.specsDir);
      ctx.openspec = await loadOpenspec(config.root);
    },
  };
  return ctx;
}

// eachPlugin(ctx, method, ...args) runs one plugin method on every plugin, in config order.
export async function eachPlugin(ctx, method, ...args) {
  const out = [];
  for (const p of ctx.config.plugins) {
    if (typeof p[method] !== 'function') continue;
    out.push({ plugin: p, result: await p[method](ctx, ...args) });
  }
  return out;
}

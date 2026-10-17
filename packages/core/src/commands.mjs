// The CLI commands: dev, build, check, prepare.
import { existsSync, watch } from 'node:fs';
import { buildSite, prepare } from './build.mjs';
import { eachPlugin } from './context.mjs';
import { debounced } from './util.mjs';
import { HANDLER_KEY } from './vite-api.mjs';

// serial(fn) -> a function that never runs two copies of fn at one time.
// A call during a run makes one more run after it.
function serial(fn) {
  let running = null;
  let again = false;
  const go = async () => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await fn();
      } while (again);
    })();
    try {
      await running;
    } finally {
      running = null;
    }
  };
  return go;
}

async function safe(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[spectrail] ${label} failed: ${err.stack || err.message}`);
  }
}

// dev(ctx, { port }) builds the site, starts the VitePress dev server, and
// rebuilds the pages when a file under openspec/ or a plugin folder changes.
/** @param {any} ctx @param {{ port?: number }} [options] */
export async function dev(ctx, { port } = {}) {
  const rebuild = serial(() => safe('page build', () => buildSite(ctx)));
  // The site still works with old prepared data (for example old screens).
  await safe('prepare', () => prepare(ctx));
  await rebuild();

  // The plugin API: `api: { name: (ctx, params) => json }`, at /__spectrail/api/<plugin>/<name>.
  globalThis[HANDLER_KEY] = async (path, params) => {
    const [name, fn] = path.split('/');
    const handler = ctx.config.plugins.find((p) => p.name === name)?.api?.[fn];
    return handler ? handler(ctx, params) : undefined;
  };

  const { createServer } = await import('vitepress');
  const server = await createServer(ctx.config.siteDir, { port: port || ctx.config.port });
  await server.listen();
  server.printUrls();

  watch(ctx.config.openspecDir, { recursive: true }, debounced(rebuild));
  const watched = [ctx.config.openspecDir];
  for (const { plugin, result } of await eachPlugin(ctx, 'watch')) {
    for (const w of result || []) {
      if (!existsSync(w.dir)) continue;
      const run = debounced(async () => {
        if (w.prepare) await safe(`${plugin.name} prepare`, () => prepare(ctx, { only: [plugin.name] }));
        await rebuild();
      }, w.delay || 300);
      watch(w.dir, { recursive: !!w.recursive }, (_event, name) => {
        if (!w.match || (name && w.match(String(name)))) run();
      });
      watched.push(w.dir);
    }
  }
  ctx.log(`watching ${watched.join(', ')}`);
}

// build(ctx) writes the static site to workDir/dist.
export async function build(ctx, { force = false } = {}) {
  await prepare(ctx, { force });
  await buildSite(ctx);
  const { build: vpBuild } = await import('vitepress');
  await vpBuild(ctx.config.siteDir);
  ctx.log(`static site: ${ctx.config.distDir}`);
}

// check(ctx) -> exit code. It prints the plugin checks; an error gives exit code 1.
export async function check(ctx, { force = false } = {}) {
  await prepare(ctx, { force });
  await ctx.refresh();
  ctx.data = {};
  await eachPlugin(ctx, 'setup');
  await eachPlugin(ctx, 'load');
  let errors = 0;
  let warnings = 0;
  for (const { plugin, result } of await eachPlugin(ctx, 'checks')) {
    for (const r of result || []) {
      const level = r.level === 'error' ? 'error' : 'warning';
      if (level === 'error') errors += 1;
      else warnings += 1;
      console.log(`${level.padEnd(7)} ${plugin.name}: ${r.message}`);
    }
  }
  console.log(`[spectrail] check: ${errors} errors, ${warnings} warnings`);
  return errors ? 1 : 0;
}

export { prepare };

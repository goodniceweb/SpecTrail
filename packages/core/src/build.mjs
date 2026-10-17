// Writes the VitePress source tree (workDir/site) from the specs and the plugins.
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eachPlugin } from './context.mjs';
import { dashboardPage } from './dashboard.mjs';
import { listFiles, syncDir, writeIfChanged } from './util.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_CSS = join(HERE, '..', 'theme', 'core.css');
const VITE_API = join(HERE, 'vite-api.mjs');

// prepare(ctx, { force }) runs the slow plugin steps (for example the screen export).
export async function prepare(ctx, { force = false, only = null } = {}) {
  for (const p of ctx.config.plugins) {
    if (typeof p.prepare !== 'function' || (only && !only.includes(p.name))) continue;
    await p.prepare(ctx, { force });
  }
}

// The folder that holds the vitepress package. Vite serves files only from
// allowed folders, and vitepress can sit outside the project (a linked install).
function vitepressRoot() {
  const req = createRequire(import.meta.url);
  return dirname(req.resolve('vitepress/package.json'));
}

// linkVitepress(siteDir): Vite looks for vitepress and vue from the site
// folder (`vue/server-renderer` in the static build, for example). With a
// linked install, they are not under the project, so the site folder gets
// links to the copies that the core uses.
function linkVitepress(siteDir) {
  const vpRoot = vitepressRoot();
  const wanted = {
    vitepress: vpRoot,
    vue: dirname(createRequire(join(vpRoot, 'package.json')).resolve('vue/package.json')),
  };
  for (const [name, target] of Object.entries(wanted)) {
    try {
      createRequire(join(siteDir, 'index.js')).resolve(`${name}/package.json`);
      continue;
    } catch {
      // Not visible from the site folder: make the link.
    }
    const link = join(siteDir, 'node_modules', name);
    mkdirSync(dirname(link), { recursive: true });
    rmSync(link, { force: true, recursive: false });
    symlinkSync(target, link, 'dir');
  }
}

function siteConfig(ctx, nav, sidebar) {
  const { config } = ctx;
  return {
    title: config.title,
    description: config.description,
    outDir: config.distDir,
    lastUpdated: false,
    // Raw HTML is on for the generated cards, figures and lists. The page
    // makers escape `<` in spec text, and `::: v-pre` stops Vue.
    markdown: { html: true },
    vite: {
      // The local search index is one large chunk; that is expected.
      build: { chunkSizeWarningLimit: 4000 },
      server: { fs: { allow: [config.siteDir, dirname(dirname(vitepressRoot())), config.root] } },
    },
    themeConfig: {
      nav,
      sidebar,
      outline: { level: [2, 3], label: 'On this page' },
      search: { provider: 'local' },
    },
  };
}

// buildSite(ctx) -> { pages, changed }
export async function buildSite(ctx) {
  const { config } = ctx;
  const siteDir = config.siteDir;
  await ctx.refresh();
  ctx.data = {};
  await eachPlugin(ctx, 'setup');
  await eachPlugin(ctx, 'load');

  const pages = new Map();
  const cards = (await eachPlugin(ctx, 'cards')).flatMap((r) => r.result || []);
  pages.set('index.md', dashboardPage(ctx, cards));
  for (const { plugin, result } of await eachPlugin(ctx, 'pages')) {
    for (const page of result || []) {
      if (pages.has(page.path)) throw new Error(`${plugin.name}: the page ${page.path} exists already.`);
      pages.set(page.path, page.content);
    }
  }

  let changed = 0;
  for (const [rel, content] of pages) if (writeIfChanged(join(siteDir, rel), content)) changed += 1;

  // Remove the pages that the plugins do not make now.
  const wanted = new Set([...pages.keys()].map((rel) => join(siteDir, rel)));
  // node_modules can hold the vitepress link (see linkVitepress): never walk into it.
  const skip = (f) => [join(siteDir, '.vitepress'), join(siteDir, 'public'), join(siteDir, 'node_modules')].includes(f);
  for (const f of listFiles(siteDir, skip)) {
    if (f.endsWith('.md') && !wanted.has(f)) {
      rmSync(f);
      changed += 1;
    }
  }

  // Theme: the default VitePress theme plus one stylesheet for the core and for each plugin.
  const styles = [['core', CORE_CSS]];
  for (const p of config.plugins) for (const s of p.styles || []) styles.push([p.name, s]);
  const themeDir = join(siteDir, '.vitepress', 'theme');
  const imports = styles.map(([name, file], i) => {
    const target = `${name}-${i}.css`;
    writeIfChanged(join(themeDir, target), readFileSync(file, 'utf8'));
    return `import './${target}';`;
  });
  for (const f of listFiles(themeDir, (f) => f === join(themeDir, 'plugins'))) {
    if (f.endsWith('.css') && !styles.some(([name], i) => f.endsWith(`${name}-${i}.css`))) rmSync(f);
  }

  // Browser code: a plugin `client` folder goes to theme/plugins/<name>/. Its
  // index.js default export is called as enhanceApp({ app, router, siteData }).
  const clients = config.plugins.filter((p) => p.client);
  const pluginsDir = join(themeDir, 'plugins');
  for (const p of clients) {
    const to = join(pluginsDir, p.name);
    for (const src of listFiles(p.client)) writeIfChanged(join(to, relative(p.client, src)), readFileSync(src, 'utf8'));
    for (const f of listFiles(to)) if (!existsSync(join(p.client, relative(to, f)))) rmSync(f);
  }
  for (const f of listFiles(pluginsDir)) {
    if (!clients.some((p) => f.startsWith(join(pluginsDir, p.name) + sep))) rmSync(f);
  }
  // A client module can also export `slots`: { slotName: Component } for the
  // default theme layout (for example 'aside-outline-before').
  const clientImports = clients.map((p, i) => `import * as client${i} from './plugins/${p.name}/index.js';`);
  const enhance = clients.map((_p, i) => `    client${i}.default?.(ctx);`);
  const modules = clients.map((_p, i) => `client${i}`).join(', ');
  writeIfChanged(
    join(themeDir, 'index.js'),
    [
      "import { h } from 'vue';",
      "import DefaultTheme from 'vitepress/theme';",
      ...imports,
      ...clientImports,
      '',
      '// Two plugins can fill one slot: both components render, in config order.',
      'const slots = {};',
      `for (const mod of [${modules}]) {`,
      '  for (const [name, c] of Object.entries(mod.slots || {})) (slots[name] ||= []).push(c);',
      '}',
      '',
      'export default {',
      '  extends: DefaultTheme,',
      '  Layout() {',
      '    return h(DefaultTheme.Layout, null, Object.fromEntries(Object.entries(slots).map(([name, cs]) => [name, () => cs.map((c) => h(c))])));',
      '  },',
      '  enhanceApp(ctx) {',
      ...enhance,
      '  },',
      '};',
      '',
    ].join('\n'),
  );

  const nav = [{ text: 'Dashboard', link: '/' }];
  const sidebar = [{ text: 'Dashboard', link: '/' }];
  for (const { result } of await eachPlugin(ctx, 'nav')) nav.push(...(result || []));
  for (const { result } of await eachPlugin(ctx, 'sidebar')) sidebar.push(...(result || []));
  // Browser data: a plugin's themeConfig() result is at useData().theme.spectrail[<plugin name>].
  const data = {};
  for (const { plugin, result } of await eachPlugin(ctx, 'themeConfig')) if (result) data[plugin.name] = result;
  const site = siteConfig(ctx, nav, sidebar);
  site.themeConfig.spectrail = data;
  writeIfChanged(join(siteDir, '.vitepress', 'site.json'), `${JSON.stringify(site, null, 2)}\n`);
  writeIfChanged(
    join(siteDir, '.vitepress', 'config.mjs'),
    [
      '// Generated by spectrail. Do not edit.',
      "import site from './site.json';",
      `import { spectrailApi } from ${JSON.stringify(VITE_API)};`,
      '',
      'export default { ...site, vite: { ...site.vite, plugins: [spectrailApi()] } };',
      '',
    ].join('\n'),
  );

  // Static files: each plugin names folders to copy into public/<to>.
  const publicDir = join(siteDir, 'public');
  const dirs = (await eachPlugin(ctx, 'publicDirs')).flatMap((r) => r.result || []);
  for (const d of dirs) syncDir(d.from, join(publicDir, d.to), d.match);
  for (const f of listFiles(publicDir)) {
    const rel = relative(publicDir, f);
    if (!dirs.some((d) => rel.startsWith(`${d.to}/`))) rmSync(f);
  }

  linkVitepress(siteDir);
  ctx.log(`${pages.size} pages (${changed} changed)`);
  return { pages: pages.size, changed };
}

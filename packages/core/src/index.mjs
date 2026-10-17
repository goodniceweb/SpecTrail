// @spectrail/core: the public API for configs and plugins.
//
// A plugin is a plain object. Every field is optional except `name`.
// The core calls the functions in config order, with `ctx` (see context.mjs)
// as the first argument. A function can be async.
//
//   name                  a unique id, for example 'reader'
//   styles: [file]        CSS files that the core adds to the theme
//   prepare(ctx, {force}) slow work before a build, for example a screen export
//   setup(ctx)            early work in each build; for example, set ctx.links
//   load(ctx)             reads data for this build into ctx.data[name]
//   pages(ctx)            -> [{ path: 'board/index.md', content }]
//   nav(ctx)              -> [{ text, link }]          top bar links
//   sidebar(ctx)          -> [VitePress sidebar items]  sections under 'Dashboard'
//   cards(ctx)            -> [{ title, value, note, link, tone: 'ok'|'warn'|'bad' }]
//   publicDirs(ctx)       -> [{ from: dir, to: 'screens', match(file) }]
//   watch(ctx)            -> [{ dir, recursive, match(name), prepare: bool, delay }]
//   checks(ctx)           -> [{ level: 'error'|'warning', message }]
//   hooks: { name(...args, ctx) }  called by other plugins through ctx.call(name, ...args)
//   client                a folder with browser code; its index.js default export is
//                         called as enhanceApp({ app, router, siteData })
//   commands: { name: { describe, run(ctx, args) -> exit code } }  extra CLI commands
//   api: { name(ctx, params) -> JSON }   served at /__spectrail/api/<plugin>/<name>
//                         under `spectrail dev` only; a static build has no server
//
// Each build runs: refresh specs -> setup -> load -> cards -> pages -> nav -> sidebar.
// The core watches openspec/ itself. A plugin adds other folders with watch().
export { loadConfig } from './config.mjs';
export { createContext } from './context.mjs';
export { API_PREFIX } from './vite-api.mjs';
export { parseSpec, loadSpecs, reqKey, scenKey } from './specs.mjs';
export {
  esc, slugify, logger, writeIfChanged, listFiles, syncDir, globToRegExp, matchesAny,
} from './util.mjs';

// defineConfig(config) -> config. It only helps the editor.
export const defineConfig = (config) => config;

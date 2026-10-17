// @spectrail/pen: pen-driven development for OpenSpec.
// A requirement names its screens with HTML comments, which markdown hides:
//   <!-- screen: design/<file>.pen#<id> -->
// A UI requirement with no screen says so with:
//   <!-- screen: none -->
// The plugin exports the screens, shows them under the requirements (with
// @spectrail/reader), and lists the gaps: screens with no spec, and UI
// requirements with no screen.
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, matchesAny } from '@spectrail/core';
import { exportScreens, readManifest } from './export.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCREEN_COMMENT = /^\s*<!--\s*screen:\s*(\S+)\s*-->\s*$/;
const DESIGN_LINE = /^Design:\s*(.+)$/;

// pen(options)
//   designDir    the folder with the .pen files; default 'design'
//   uiSpecs      globs of spec ids whose requirements need a screen, for
//                example ['mobile/ui/**']. Default: none.
//   designLines  also read `Design: <path>` lines; default true
//   strict       `spectrail check` fails on the gaps, not only on bad links
//   base         the URL folder of the gallery; default '/design/'
//   cli          the path of the pen CLI script; default: @pen.dev/cli of the project
//   files        globs of the .pen files to export, for example ['app.pen'];
//                default: every .pen file except the `.lib.pen` libraries
//   minWidth     a screen is a top-level, not reusable frame at least this wide; default 320
//   include      more top-level node ids to export, for example a narrow dialog frame
export function pen(options = {}) {
  const base = `/${(options.base || '/design/').replace(/^\/+|\/+$/g, '')}/`;
  const uiSpecs = options.uiSpecs || [];
  const designLines = options.designLines !== false;

  const dirs = (ctx) => {
    const designDir = join(ctx.root, options.designDir || 'design');
    return {
      designDir,
      // The path prefix that the spec comments use, for example `design`.
      prefix: relative(ctx.root, designDir).split(sep).join('/'),
      outDir: ctx.cacheDir('pen'),
    };
  };

  // refsOf(req) -> { paths: [path], none: bool } from the requirement text.
  const refsOf = (req) => {
    const paths = [];
    let none = false;
    for (const line of req.lines) {
      const c = line.match(SCREEN_COMMENT);
      if (c) {
        if (c[1] === 'none') none = true;
        else paths.push(c[1]);
        continue;
      }
      const d = designLines && line.match(DESIGN_LINE);
      if (d) paths.push(d[1].trim());
    }
    return { paths, none };
  };

  const data = (ctx) => ctx.data.pen;
  const screenUrl = (s) => `/screens/${s.file.replace(/\.pen$/, '')}/${s.id}.webp`;
  const galleryId = (s) => `${s.file.replace(/\.pen$/, '')}-${s.id}`;
  const reqLink = (ctx, u) => ctx.links.requirement(u.spec.id, u.req.slug);

  function figure(s, { id = null, caption }) {
    return (
      `<figure class="screen"${id ? ` id="${esc(id)}"` : ''}><a href="${esc(screenUrl(s))}" target="_blank">` +
      `<img src="${esc(screenUrl(s))}" alt="${esc(s.name)}" width="${s.width}" height="${s.height}" loading="lazy"></a>` +
      `<figcaption>${caption}</figcaption></figure>`
    );
  }

  function usersHtml(ctx, users) {
    if (!users.length) return '<div class="used-by none">No spec</div>';
    const links = users.map((u) => {
      const text = `${esc(u.spec.id)}: ${esc(u.req.name)}`;
      const url = reqLink(ctx, u);
      return url ? `<a href="${esc(url)}">${text}</a>` : `<span>${text}</span>`;
    });
    return `<div class="used-by">${links.join('')}</div>`;
  }

  // designHtml(ctx, paths) -> the block under a requirement.
  function designHtml(ctx, paths) {
    const d = data(ctx);
    const out = paths.map((path) => {
      const m = path.match(/^(.*)\/([^/#]+)\.pen(?:#(.+))?$/);
      if (m && m[1] === d.prefix) {
        const [, , fileBase, id] = m;
        // A bare file link adds nothing when the requirement names a screen of that file.
        if (!id && paths.some((p) => p.startsWith(`${path}#`))) return '';
        if (!id) {
          return `<div class="design-link">Design: <a href="${base}#${esc(fileBase)}">${esc(path)}</a> <span class="hint">(file, no screen id)</span></div>`;
        }
        const s = d.screens.get(path);
        if (!s) {
          return `<div class="design-link">Design: <code>${esc(path)}</code> <span class="missing">screen not found in the export</span></div>`;
        }
        return figure(s, {
          caption: `${esc(s.name)} <a href="${base}#${esc(galleryId(s))}"><code>${esc(s.id)}</code></a>`,
        });
      }
      const url = ctx.fileUrl(path);
      const link = url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(path)}</a>` : `<code>${esc(path)}</code>`;
      return `<div class="design-link">Design: ${link}</div>`;
    });
    return `<div class="design-refs">${out.join('')}</div>`;
  }

  function galleryPage(ctx) {
    const d = data(ctx);
    const lines = [
      '---', 'title: Design screens', 'aside: false', '---', '', '::: v-pre', '# Design screens', '',
      'A requirement names a screen with `<!-- screen: <path>.pen#<id> -->`. The spec pages show the screens',
      'next to the requirements. This page shows the gaps first, then all screens.', '',
      `A screen is a top-level frame, at least ${options.minWidth ?? 320} px wide, that is not a reusable component.`,
      'Components and icons are not here: they have a meaning only inside a screen.', '',
    ];
    if (d.manifest.screens.length === 0) {
      lines.push('No screens are exported. Run `spectrail prepare` (it needs the pen CLI).', '');
    }

    lines.push('## Screens with no spec {#no-spec}', '');
    if (d.noSpec.length) {
      lines.push(
        `${d.noSpec.length} screens have no requirement. A screen with no spec probably has no test either.`, '',
        `<div class="gallery">${d.noSpec.map((s) => figure(s, { id: `gap-${galleryId(s)}`, caption: `<strong>${esc(s.name)}</strong><code>${esc(s.file)}#${esc(s.id)}</code>${usersHtml(ctx, [])}` })).join('')}</div>`, '',
      );
    } else {
      lines.push('Every screen is in a spec.', '');
    }

    lines.push('## UI requirements with no screen {#no-screen}', '');
    if (!uiSpecs.length) {
      lines.push('The config names no UI specs. Set `uiSpecs` in the pen plugin options, for example `[\'mobile/ui/**\']`.', '');
    } else if (d.noScreen.length) {
      lines.push(
        `${d.noScreen.length} requirements in the UI specs (${uiSpecs.map((g) => `\`${g}\``).join(', ')}) have no screen.`,
        'If a requirement is about function only, add `<!-- screen: none -->` under its text.', '',
      );
      for (const u of d.noScreen) {
        const url = reqLink(ctx, u);
        const text = `\`${u.spec.id}\`: ${esc(u.req.name)}`;
        lines.push(`- ${url ? `[${text}](${url})` : text}`);
      }
      lines.push('');
    } else {
      lines.push('Every UI requirement has a screen.', '');
    }

    const files = [...new Set(d.manifest.screens.map((s) => s.file))];
    for (const file of files) {
      const fileBase = file.replace(/\.pen$/, '');
      lines.push(`## ${file} {#${fileBase}}`, '');
      const fileUsers = d.usedBy.get(`${d.prefix}/${file}`) || [];
      if (fileUsers.length) {
        lines.push(
          `Requirements that link the whole file, with no screen id: ${fileUsers
            .map((u) => {
              const url = reqLink(ctx, u);
              const text = `\`${u.spec.id}\`: ${esc(u.req.name)}`;
              return url ? `[${text}](${url})` : text;
            })
            .join(', ')}.`,
          '',
        );
      }
      const cards = d.manifest.screens
        .filter((s) => s.file === file)
        .map((s) => figure(s, {
          id: galleryId(s),
          caption: `<strong>${esc(s.name)}</strong><code>${esc(s.file)}#${esc(s.id)}</code>${usersHtml(ctx, d.usedBy.get(`${d.prefix}/${s.file}#${s.id}`) || [])}`,
        }));
      lines.push(`<div class="gallery">${cards.join('')}</div>`, '');
    }
    lines.push(':::', '');
    return lines.join('\n');
  }

  return {
    name: 'pen',
    styles: [join(HERE, 'pen.css')],

    prepare(ctx, { force }) {
      const { designDir, outDir } = dirs(ctx);
      exportScreens({
        root: ctx.root, designDir, outDir, cli: options.cli, dirs: [dirname(ctx.config.file)], force,
        files: options.files, minWidth: options.minWidth ?? 320, include: options.include || [],
      });
    },

    load(ctx) {
      const { prefix, outDir } = dirs(ctx);
      const manifest = readManifest(outDir);
      const screens = new Map(manifest.screens.map((s) => [`${prefix}/${s.file}#${s.id}`, s]));
      const usedBy = new Map(); // path -> [{ spec, req }]
      const refs = new Map(); // `spec:req` -> { paths, none }
      const noScreen = [];
      const badRefs = [];
      for (const spec of ctx.specs) {
        const isUi = matchesAny(spec.id, uiSpecs);
        for (const req of spec.requirements) {
          const r = refsOf(req);
          refs.set(`${spec.id}:${req.slug}`, r);
          for (const path of r.paths) {
            if (!usedBy.has(path)) usedBy.set(path, []);
            usedBy.get(path).push({ spec, req });
            if (/\.pen#/.test(path) && path.startsWith(`${prefix}/`) && !screens.has(path)) {
              badRefs.push({ spec, req, path });
            }
          }
          const hasScreen = r.paths.some((p) => /\.pen(#|$)/.test(p));
          if (isUi && !hasScreen && !r.none) noScreen.push({ spec, req });
        }
      }
      const noSpec = manifest.screens.filter((s) => !usedBy.has(`${prefix}/${s.file}#${s.id}`));
      ctx.data.pen = { prefix, manifest, screens, usedBy, refs, noScreen, noSpec, badRefs };
    },

    hooks: {
      'reader:hideLine'(line) {
        return SCREEN_COMMENT.test(line) || (designLines && DESIGN_LINE.test(line));
      },
      'reader:requirement'({ spec, req }, ctx) {
        const d = data(ctx);
        const r = d.refs.get(`${spec.id}:${req.slug}`);
        const links = r?.paths.length ? designHtml(ctx, r.paths) : '';
        const gap = d.noScreen.some((u) => u.spec === spec && u.req === req)
          ? `<div class="design-refs"><div class="design-link missing">This UI requirement has no screen. <a href="${base}#no-screen">All gaps</a></div></div>`
          : '';
        return links + gap;
      },
    },

    cards(ctx) {
      const d = data(ctx);
      const cards = [{
        title: 'Design screens',
        value: d.manifest.screens.length,
        note: `${d.noSpec.length} with no spec`,
        link: `${base}#no-spec`,
        tone: d.noSpec.length ? 'warn' : 'ok',
      }];
      if (uiSpecs.length) {
        cards.push({
          title: 'UI requirements with no screen',
          value: d.noScreen.length,
          note: uiSpecs.join(', '),
          link: `${base}#no-screen`,
          tone: d.noScreen.length ? 'warn' : 'ok',
        });
      }
      return cards;
    },

    pages: (ctx) => [{ path: `${base.slice(1)}index.md`, content: galleryPage(ctx) }],
    nav: () => [{ text: 'Design screens', link: base }],
    sidebar: () => [{ text: 'Design screens', link: base }],
    publicDirs: (ctx) => [{ from: dirs(ctx).outDir, to: 'screens', match: (f) => f.endsWith('.webp') }],
    watch: (ctx) => [{ dir: dirs(ctx).designDir, match: (n) => n.endsWith('.pen'), prepare: true, delay: 1000 }],

    checks(ctx) {
      const d = data(ctx);
      const gap = options.strict ? 'error' : 'warning';
      const out = [];
      if (d.manifest.screens.length === 0) out.push({ level: 'warning', message: 'no screens are exported' });
      for (const b of d.badRefs) {
        out.push({ level: 'error', message: `${b.spec.id}: "${b.req.name}" names ${b.path}, but the export has no such screen` });
      }
      for (const s of d.noSpec) out.push({ level: gap, message: `screen ${d.prefix}/${s.file}#${s.id} (${s.name}) has no spec` });
      for (const u of d.noScreen) out.push({ level: gap, message: `${u.spec.id}: "${u.req.name}" is a UI requirement with no screen` });
      return out;
    },
  };
}

export default pen;

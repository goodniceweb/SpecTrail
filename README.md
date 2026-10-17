# spectrail

A local web dashboard for an OpenSpec repo. The core shows the data of
`openspec view`. Plugins add pages, dashboard cards, and checks.

## Packages

| Package | What it does | Status |
|---|---|---|
| `@spectrail/core` | The dashboard, the `spectrail` CLI, the config, and the plugin API | works |
| `@spectrail/reader` | One page for each spec, as the spec is on disk. Optional test coverage under each scenario. | works |
| `@spectrail/pen` | The pen.dev screens inside the spec pages. Lists screens with no spec, and UI requirements with no screen. | works |
| `@spectrail/vocabulary` | The dictionary page: approved terms and banned synonyms, with checks | works |
| `@spectrail/kanban` | A board of ideas and changes, plus the `/opsx:idea` command | works |
| `spectrail` | The meta package: all of the above, plus `preset()` | works |

Each plugin lists `@spectrail/core` as a peer dependency. The pen plugin
lists `@pen.dev/cli` as an optional peer dependency.

## Use in a project

1. Install: `npm i -D spectrail @fission-ai/openspec`. For screens, also install `@pen.dev/cli`.
2. Add `.spectrail/` to `.gitignore`.
3. Create `spectrail.config.mjs` in the project root:

   ```js
   import { defineConfig, preset } from 'spectrail';

   export default defineConfig({
     title: 'My specs',
     repo: { url: 'https://github.com/org/repo', ref: 'main' },
     plugins: preset({ pen: { uiSpecs: ['mobile/ui/**'] } }),
   });
   ```

4. Run one of the commands:
   - `npx spectrail dev`: serve the site on port 5174, and rebuild on each change.
   - `npx spectrail build`: write the static site to `.spectrail/dist/`.
   - `npx spectrail check`: run the plugin checks. An error gives exit code 1, for CI.
   - `npx spectrail prepare`: do only the slow steps, for example the screen export.

### Before the first npm release

spectrail is not on npm yet. A project can link a local checkout:

```sh
npm i -D file:../spectrail/packages/spectrail
```

The path is relative to the project. Run `npm install` in the spectrail checkout first.
VitePress and Vue then sit in the spectrail checkout, not in the project, so the core
links them into `.spectrail/site/node_modules/`.

If CI runs `npm ci` in the project root, do not add the link there: CI has no
spectrail checkout. Give spectrail its own folder with its own `package.json`
instead, as Ostrivia does in `spectrail/`, and call it with `npm --prefix spectrail`.

## Spec pages (reader plugin)

The left sidebar has one "Specs" link. On the spec pages, the right sidebar shows the
tree of all specs in place of the page outline. The spec in focus also lists its
requirements. On a screen narrower than 1280 px, VitePress hides the right sidebar;
the "Specs" page then lists all specs.

## Screens in the specs (pen plugin)

Put an HTML comment under the requirement text. Markdown does not show it.

```markdown
### Requirement: Game HUD
The HUD SHALL show ...

<!-- screen: design/current.pen#rBkgX -->
```

If a requirement in a UI spec is about function only, write `<!-- screen: none -->`.
The plugin then does not list it as a gap.

The plugin exports only **screens**: top-level frames that are not reusable components
and are at least `minWidth` px wide (default 320). Components, icons, and loose parts
have a meaning only inside a screen, so the gallery does not list them as gaps.
Options:

- `files`: globs of the `.pen` files to export, for example `['app.pen', 'web.pen']`.
  The default is every `.pen` file except the `.lib.pen` libraries.
- `minWidth`: the smallest width of a screen.
- `include`: more top-level node ids to export, for example a narrow dialog frame.

The pen CLI needs a key. The plugin reads `PEN_CLI_KEY`. On macOS it uses the
Keychain entry `pen-cli-key` if the variable is not set. The key goes only
into the env of the pen process.

## Board and ideas (kanban plugin)

The board has five columns:

| Column | Cards |
|---|---|
| Exploring | the `.md` files in the ideas folder (default `openspec/ideas/`) that are not linked to a change |
| Todo | the active changes with no checked task |
| In progress | the active changes with some checked tasks |
| Testing | the active changes with all tasks checked, not archived |
| Done | the folders in `openspec/changes/archive/` |

A filter above the board shows all Done cards, only the last month or week, or hides the column.
The browser keeps the choice. Each card opens a page with the files of the idea or the change.

`/opsx:idea` is a Claude Code command that saves a raw idea. It does not explore the
idea or make a change. Install it into the project with:

```sh
npx spectrail install-idea-command
```

An idea leaves the Exploring column when its frontmatter has `change: <change-name>`,
or when a change has the same name as the idea slug. The board then shows the idea on the card of that change.

## Dictionary (vocabulary plugin)

The plugin reads `openspec/dictionary.md` (option `file`). Two forms give bans:

```markdown
## Actors and roles

- **seat** — a numbered position. Do not use: slot (for seats).

| Do not write | Write instead |
|---|---|
| participant, member, user | player |
```

A text search cannot see the sense of a word. So the plugin puts each banned word in one of two classes:

- **Banned:** no source limits the ban to one sense, and the dictionary itself never uses the word.
  `spectrail check` reports these words (level `warning`, or `error` with `level: 'error'`).
- **Check the sense:** the ban has a limit in parentheses, for example "slot (for seats)", or the
  dictionary uses the word in another sense. The page lists these words for a person to review.

The vocabulary page has two buttons: "Check the OpenSpec files" and "Check the whole repo".
In markdown, the check skips code, HTML comments, link targets, and "quoted" UI copy.
In code files, it reads only the comments. The buttons work under `spectrail dev`.
A static build shows the OpenSpec result from build time.

Set a rule by hand with `rules: { control: 'contextual', backup: 'off' }`.

## Plugin API

A plugin is a plain object with a `name`. The other fields are optional.
The full list is in `packages/core/src/index.mjs`. In short:

- `prepare`, `setup`, `load`: get data. `ctx.specs` holds the parsed specs.
- `pages`, `nav`, `sidebar`, `cards`: add to the site.
- `checks`: add to `spectrail check`.
- `watch`, `publicDirs`: add folders to watch, and static files.
- `client`: a folder with browser code, for example Vue components. Its `slots` export
  fills layout slots of the default theme, for example the right sidebar.
- `themeConfig`: JSON for the browser code, at `useData().theme.spectrail[<plugin>]`.
- `commands`: extra CLI commands, for example `install-idea-command`.
- `api`: functions that the page calls at `/__spectrail/api/<plugin>/<name>`, under `spectrail dev` only.
- `hooks`: functions that other plugins call. For example, the reader calls
  `reader:requirement` and `reader:hideLine`, and the pen plugin answers them.

## Development

```sh
npm install
OSTRIVIA_ROOT=/path/to/ostrivia_monorepo npm run example:dev
```

`examples/ostrivia.config.mjs` is a trial config for the Ostrivia monorepo.
It writes the site into `.example-build/`, so the Ostrivia working tree does not change.

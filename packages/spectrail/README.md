# spectrail

A local web dashboard for an [OpenSpec](https://github.com/Fission-AI/OpenSpec) repo.
This package installs the core and all plugins: the spec pages, the pen.dev screens,
the vocabulary, and the kanban board.

```sh
npm i -D spectrail @fission-ai/openspec
```

```js
// spectrail.config.mjs
import { defineConfig, preset } from 'spectrail';

export default defineConfig({
  title: 'My specs',
  plugins: preset({ pen: false }),
});
```

```sh
npx spectrail dev     # serve the site on port 5174
npx spectrail build   # write the static site to .spectrail/dist/
npx spectrail check   # run the plugin checks, for CI
```

`preset(options)` gives all plugins. Give the options of one plugin under its name,
or `false` to leave it out. The full guide is in the [repository README](https://github.com/goodniceweb/spectrail#readme).

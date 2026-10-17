# @spectrail/core

The core of spectrail: the `spectrail` CLI, the config, the dashboard, and the plugin API.

Most projects install the [`spectrail`](https://www.npmjs.com/package/spectrail) package,
which includes the core and all plugins. Install the core alone to choose the plugins:

```sh
npm i -D @spectrail/core @spectrail/reader @fission-ai/openspec
```

```js
// spectrail.config.mjs
import { defineConfig } from '@spectrail/core';
import { reader } from '@spectrail/reader';

export default defineConfig({ title: 'My specs', plugins: [reader()] });
```

A plugin is a plain object with a `name`. The other fields are optional:
`prepare`, `setup`, `load`, `pages`, `nav`, `sidebar`, `cards`, `checks`,
`watch`, `publicDirs`, `styles`, `client`, `themeConfig`, `commands`, `api`, and `hooks`.
The comment at the top of `src/index.mjs` describes each field.

The full guide is in the [repository README](https://github.com/goodniceweb/spectrail#readme).

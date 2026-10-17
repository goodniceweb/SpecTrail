# @spectrail/reader

A spectrail plugin: one page for each OpenSpec spec, as the spec is on disk, with optional test coverage under each scenario.

```js
import { reader } from '@spectrail/reader';

reader({ base: '/specs/', coverage: async (ctx) => new Map() });
```

- `base`: the URL folder of the spec pages. The default is `/specs/`.
- `coverage`: an async function that gives a `Map` from `cap:req:scen` to a list of items.
  An item is `{ kind, label, url?, note?, code?, missing? }`.

On the spec pages, the right sidebar shows the tree of all specs.

The full guide is in the [repository README](https://github.com/goodniceweb/spectrail#readme).

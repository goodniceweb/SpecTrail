# @spectrail/pen

A spectrail plugin: the pen.dev screens inside the spec pages, and the gaps between screens and specs.

```sh
npm i -D @spectrail/pen @pen.dev/cli
```

A requirement names its screens with an HTML comment under the requirement text:

```markdown
<!-- screen: design/app.pen#rBkgX -->
```

If a UI requirement needs no screen, write `<!-- screen: none -->`.

Options: `designDir`, `uiSpecs`, `files`, `minWidth`, `include`, `strict`, `base`, and `cli`.
The pen CLI needs a key. The plugin reads `PEN_CLI_KEY`. On macOS, it uses the Keychain
entry `pen-cli-key` if the variable is not set. The key goes only into the env of the pen process.

The full guide is in the [repository README](https://github.com/goodniceweb/spectrail#readme).

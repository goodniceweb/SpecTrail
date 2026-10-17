# @spectrail/vocabulary

A spectrail plugin: the project dictionary, with approved terms, banned synonyms, and checks.

The plugin reads `openspec/dictionary.md`:

```markdown
## Things

- **item** — one entry of a list. Do not use: task (for list entries), entry.

| Do not write | Write instead |
|---|---|
| checklist | list |
```

`spectrail check` reports each banned word in the OpenSpec files. A ban with a sense
limit, for example "task (for list entries)", goes to a list for a person to review.

Options: `file`, `openspecExclude`, `repo`, `quotes`, `rules`, `level`, `checkRepo`, and `base`.

The full guide is in the [repository README](https://github.com/goodniceweb/spectrail#readme).

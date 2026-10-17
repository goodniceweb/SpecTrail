# @spectrail/kanban

A spectrail plugin: a board of ideas and OpenSpec changes, plus the `/opsx:idea` command for Claude Code.

The board has five columns: Exploring (ideas), Todo, In progress, Testing, and Done.

- `ideasDir`: the folder of the ideas. The default is `openspec/ideas`.
- `base`: the URL folder of the board. The default is `/board/`.

Install the `/opsx:idea` command into the project:

```sh
npx spectrail install-idea-command
```

The full guide is in the [repository README](https://github.com/goodniceweb/spectrail#readme).

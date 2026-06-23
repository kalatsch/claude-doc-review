# claude-doc-review

A Claude Code plugin. `/doc-review <file.md>` renders any markdown document Claude
produced as a human-friendly review page — clear prose, glossary tooltips,
collapsible technical detail — with an inline text-selection commenting layer
that syncs live to Claude through a tiny local server. No cloud, no accounts,
no telemetry — everything runs on your machine.

## Install

Inside Claude Code, add this GitHub repo as a plugin source and install from it
— no central publishing involved. These are two separate slash commands; run
them one at a time, in order (the install needs the source added first):

```bash
/plugin marketplace add kalatsch/claude-doc-review
/plugin install claude-doc-review@claude-doc-review
```

To update later, use the built-in `/plugin` menu → **Manage plugins →
claude-doc-review → Update** (then restart the window or run `/reload-plugins`
to load it into the current session).

> Sharing with teammates? Send them the install page —
> **<https://kalatsch.github.io/claude-doc-review/>** (served from
> [`docs/index.html`](docs/index.html) via GitHub Pages).

## Usage

```
/doc-review path/to/document.md
```

Artifacts are written to `<project>/.claude/doc-review/<slug>/` and served
locally. Select text on the page to leave a comment; Claude answers in the
thread. The output folder is kept out of the host project's git automatically.

See `docs/specs/` for the design and `docs/plans/` for the implementation plan.

## Development

```bash
npm install            # installs playwright (devDependency)
npx playwright install chromium
npm test               # serve API + browser smoke + e2e
```

## How it works

`/doc-review <file.md>` humanizes the file into `human.md` (clear prose +
`## Словарь` + collapsible `<details>`), copies `review.html`, `serve.cjs`,
`marked.min.js` into `<project>/.claude/doc-review/<slug>/`, writes `source.md`
and an empty `comments.json`, and serves the folder. The output lives under
`.claude/doc-review/`, which the command keeps out of the host project's git via
a self-contained `.gitignore`. The server is `serve.cjs` (CommonJS regardless of
the host project's `package.json` `type`). `review.html` renders `human.md` and
overlays the commenting engine; comments round-trip through `comments.json`.

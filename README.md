# claude-doc-review

A Claude Code plugin. `/doc-review <file.md>` renders any markdown document Claude
produced as a human-friendly review page — clear prose, glossary tooltips,
collapsible technical detail — with an inline text-selection commenting layer
that syncs live to Claude through a tiny local server.

## Usage

```
/doc-review path/to/document.md
```

Artifacts are written to `<project>/.claude/info/<slug>/` and served locally.
Select text on the page to leave a comment; Claude answers in the thread.

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

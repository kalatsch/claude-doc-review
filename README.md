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

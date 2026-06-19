---
description: Render a markdown document as a human-friendly review page with glossary, collapsible detail, and an inline commenting layer that syncs to Claude
argument-hint: "<path/to/document.md>"
allowed-tools: Bash(node *), Bash(mkdir *), Bash(cp *), Bash(test *), Bash(echo *), Bash(open *), Bash(xdg-open *), Bash(lsof *), Read, Write
---

# /doc-review

Turn a terse technical markdown document into a human-friendly review page and
serve it locally for inline commenting. Run these steps; keep chat output short.

## Step 1 — Resolve the source

`$ARGUMENTS` is the path to a markdown file (the technical doc you wrote for
yourself). If empty, ask the user for the path and stop. Verify it exists:

```bash
test -f "$ARGUMENTS" || echo "MISSING: $ARGUMENTS"
```

If MISSING, tell the user and stop.

## Step 2 — Humanize into human.md (this is the value of the command)

Read the source with the Read tool. Produce a human-facing rewrite. Rules:

- Plain, concrete prose for a reader who is NOT in your head. Expand jargon and
  acronyms on first use. Keep the author's decisions and facts; do not invent.
- Lead with what the thing is and what "done" means before mechanics.
- Wrap genuinely deep/technical asides in a collapsible block so the main read
  stays light:

```html
<details>
<summary>Короткое название детали</summary>

…подробности…

</details>
```

- End with a `## Словарь` section: `- **Term** — one-sentence definition.` for
  every term a non-author reader might not know. These power the page tooltips.
- Do NOT add comment threads or page chrome — only the document content.

Hold the rewritten markdown in memory for Step 4 (write it as `human.md`).

## Step 3 — Compute slug and target folder

```bash
SLUG=$(basename "$ARGUMENTS" .md | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-//; s/-$//')
DEST=".claude/info/$SLUG"
mkdir -p "$DEST"
echo "DEST=$DEST"
```

## Step 4 — Lay down the artifacts

Copy the three assets from the plugin and write the documents:

```bash
cp "${CLAUDE_PLUGIN_ROOT}/assets/review.html" "$DEST/review.html"
cp "${CLAUDE_PLUGIN_ROOT}/assets/serve.js"     "$DEST/serve.js"
cp "${CLAUDE_PLUGIN_ROOT}/assets/marked.min.js" "$DEST/marked.min.js"
cp "$ARGUMENTS" "$DEST/source.md"
test -f "$DEST/comments.json" || echo '{"version":1,"threads":[]}' > "$DEST/comments.json"
```

Then write the humanized markdown from Step 2 to `$DEST/human.md` with the Write
tool (use the absolute path `<project>/.claude/info/<slug>/human.md`).

## Step 5 — Serve and report

Start the server in the background and report the URL:

```bash
(cd "$DEST" && PORT=${PORT:-4178} node serve.js >/dev/null 2>&1 &) ; sleep 1
echo "http://localhost:${PORT:-4178}/"
```

Tell the user: open the URL, select text to comment, Claude answers in threads.
Output one line with the URL and the folder path. Nothing else.

## Step 6 — Answer comments (rest of the session)

When the user says they left comments (or asks you to check), read
`$DEST/comments.json`, answer each open thread whose latest message is from the
user: append a `{author:"claude", …}` message, set the user message's handled
state, and `resolved` only when the thread is settled. Write the file back. The
browser polls and shows your replies within a few seconds.

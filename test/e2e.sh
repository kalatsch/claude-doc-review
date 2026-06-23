#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
SRC="$ROOT/test/fixtures/sample-technical.md"

SLUG=$(basename "$SRC" .md | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-//; s/-$//')
DEST="$WORK/.claude/doc-review/$SLUG"; mkdir -p "$DEST"
cp "$ROOT/assets/review.html" "$DEST/"; cp "$ROOT/assets/serve.cjs" "$DEST/"; cp "$ROOT/assets/marked.min.js" "$DEST/"
cp "$SRC" "$DEST/source.md"; cp "$SRC" "$DEST/human.md"
echo '{"version":1,"threads":[]}' > "$DEST/comments.json"
# host project marks itself as ESM — serve.cjs must still run
echo '{"type":"module"}' > "$WORK/package.json"

PORT=$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
(cd "$DEST" && PORT=$PORT node serve.cjs >/dev/null 2>&1 &) ; sleep 1
code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/")
md=$(curl -s "http://localhost:$PORT/human.md" | head -1)
pkill -f "node serve.cjs" || true
[ "$code" = "200" ] || { echo "FAIL http $code"; exit 1; }
echo "$md" | grep -q "split engine" || { echo "FAIL human.md not served"; exit 1; }
echo "e2e OK ($DEST)"

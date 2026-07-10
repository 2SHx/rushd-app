#!/bin/sh
# PostToolUse hook (Edit|Write): typecheck after TS/TSX changes so the agent sees
# errors immediately instead of re-reading its own edits. Exit 2 feeds stderr back.
file=$(node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write((j.tool_input&&j.tool_input.file_path)||"")}catch(e){}})')
case "$file" in
  *.ts|*.tsx)
    cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
    if ! out=$(npx tsc --noEmit --pretty false 2>&1); then
      printf '%s\n' "$out" | head -20 >&2
      exit 2
    fi
    ;;
esac
exit 0

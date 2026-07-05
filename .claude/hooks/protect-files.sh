#!/bin/sh
# PreToolUse hook (Edit|Write): migrations and env files are never-events for agents.
# Exit 2 blocks the tool call and surfaces the message to the agent.
file=$(node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write((j.tool_input&&j.tool_input.file_path)||"")}catch(e){}})')
case "$file" in
  */prisma/migrations/*)
    echo "BLOCKED by hook: migrations are generated only via 'npx prisma migrate dev', never hand-edited." >&2
    exit 2
    ;;
  */.env|*/.env.*)
    echo "BLOCKED by hook: .env files are human-only. Tell the user which variable to set instead." >&2
    exit 2
    ;;
esac
exit 0

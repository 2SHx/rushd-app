# Any-Model Agents — Routing Guide

The 9 agent definitions in `.claude/agents/*.md` are the canonical layer (plain system prompts + tool lists). Three independent routes run them on **any** model. Pick per agent, per task, or per budget — the definitions never change.

## Route 1 — Swap models INSIDE Claude Code (gateway) · zero workflow change

Claude Code speaks the Anthropic API to whatever `ANTHROPIC_BASE_URL` points at. Run a [LiteLLM](https://docs.litellm.ai) gateway that maps the tier names our agents already use (`haiku`/`sonnet`/`opus`) to ANY provider — Gemini, GPT, Qwen, DeepSeek, or local Ollama:

```yaml
# litellm-config.yaml — "sonnet" now means Gemini; agents files untouched
model_list:
  - model_name: sonnet   # implementation tier
    litellm_params: { model: gemini/gemini-2.5-pro, api_key: os.environ/GEMINI_API_KEY }
  - model_name: haiku    # explorer tier
    litellm_params: { model: gemini/gemini-2.5-flash, api_key: os.environ/GEMINI_API_KEY }
  - model_name: opus     # review/design tier — keep the strongest model you have
    litellm_params: { model: anthropic/claude-opus-4-8, api_key: os.environ/ANTHROPIC_API_KEY }
```
```bash
pip install 'litellm[proxy]' && litellm --config litellm-config.yaml --port 4000
export ANTHROPIC_BASE_URL=http://localhost:4000 ANTHROPIC_AUTH_TOKEN=sk-anything
claude   # entire agent system — tools, hooks, skills, MCP — now runs on the mapped models
```
**When to use:** you want the full orchestration (dispatch protocol, hooks, review chain) but different/cheaper engines. **Caveat:** tool-calling quality varies by model; keep `opus` mapped to a genuinely strong model for qa-reviewer/security-auditor/architect or the review chain loses its teeth.

## Route 2 — Per-agent dispatch to any CLI runner (`scripts/dispatch.mjs`)

One command runs any agent on any installed runner, injecting its canonical definition:

```bash
node scripts/dispatch.mjs --list                              # routing table
node scripts/dispatch.mjs backend-expert "wire addXP into the quiz API per SYSTEM_DESIGN M3"
DISPATCH_RUNNER=gemini DISPATCH_MODEL=gemini-2.5-pro \
  node scripts/dispatch.mjs frontend-expert "build /markets page"   # one-off override
```

Routing lives in `scripts/models.map.json` — edit `runner` + `model` per agent. Non-Claude runners get the AGENTS.md house rules appended automatically (hooks don't exist there; rules travel in the prompt).

| Runner | Install | Models | Notes |
|---|---|---|---|
| `claude` | `npm i -g @anthropic-ai/claude-code` | Claude tiers (or anything via Route 1) | Full hooks/skills/MCP; `--permission-mode acceptEdits` |
| `gemini` | `npm i -g @google/gemini-cli` | gemini-2.5-pro / -flash (free tier available) | `--yolo` auto-approves; add MCP in `~/.gemini/settings.json` |
| `opencode` | `npm i -g opencode-ai` | **75+ providers** incl. `openrouter/*`, `ollama/*` (local, free) | The universal fallback — one runner covers everything else |
| `codex` | `npm i -g @openai/codex` | GPT-5 family | `exec --full-auto` |

**Local/free models:** you already have Ollama (`~/.local/bin/ollama`). Install opencode, then e.g. `"backend-expert": { "runner": "opencode", "model": "ollama/qwen3-coder" }` — fully offline agents.

**When to use:** cost control per agent (free Gemini for exploration, local model for drafts), provider redundancy, or comparing model quality on identical dispatches.

## Route 3 — Inside Antigravity (interactive)

Antigravity's Gemini agents read `AGENTS.md` (root) and can load any agent's full definition on demand: *"Read .claude/agents/frontend-expert.md and act as that agent for this task: …"*. Shared MCP servers connect via Antigravity's MCP settings (see AGENTS.md). One writer per working tree — commit before switching tools.

## Invariants that hold on every route

1. `.claude/agents/*.md` is the single source of truth — never fork an agent definition into another tool's format; inject or reference it.
2. The verification gate is model-independent: `npm run lint && npx tsc --noEmit` (+ `npx vitest run` once tests exist). A report without executed evidence is not DONE, whichever model wrote it.
3. The review chain is about **fresh context, not vendor**: qa-reviewer/security-auditor may run on any strong model, but never on the same conversation that wrote the code.
4. `docs/SYSTEM_DESIGN.md` binds every model equally; contradictions route to the architect.
5. Protected paths (`prisma/migrations/**`, `.env*`) are hook-enforced only in Claude Code — on other runners the prompt carries the rule; review diffs accordingly.

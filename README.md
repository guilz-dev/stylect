# Stylect

**Learn your coding dialect. Teach it to your agents.**

Stylect mines git history to extract personal or team coding conventions, then
writes agent-ready rules (Cursor `.cursor/rules/`, Orbit personas, wiki).

Part of the [Planetz](https://github.com/guilz-dev/planetz) agent tooling family
alongside [belay](https://github.com/guilz-dev/belay).

## Status

Published on npm (`1.4.0`). Full pipeline through **write** is implemented, including incremental LLM, cache-only `stylect write`, debug `stylect fetch` / `sample`, output language control (`--output-lang`, `STYLECT_OUTPUT_LANG`), and provider selection across Cursor, OpenAI, and Anthropic.

## Install

### From npm

```bash
npm install -g @guilz-dev/stylect
# or: pnpm add -g @guilz-dev/stylect
```

### From source

```bash
pnpm install
pnpm build
```

Run locally:

```bash
node dist/cli.js run --plan --author you --repo owner/name
```

## Quick start

```bash
# Set these once per shell session
export STYLECT_AUTHOR=you
export STYLECT_REPO=owner/repo

# Shortest run (from the target local clone directory)
cd /path/to/local/clone
stylect run -a "$STYLECT_AUTHOR" -r "$STYLECT_REPO"

# Plan only
stylect run -a "$STYLECT_AUTHOR" -r "$STYLECT_REPO" --plan

# Fetch + sample only (skip LLM)
stylect run -a "$STYLECT_AUTHOR" -r "$STYLECT_REPO" --skip-llm

# Override output paths / language only when needed
stylect run -a "$STYLECT_AUTHOR" -r "$STYLECT_REPO" \
  -o ./wiki --rules-dir ./.cursor/rules --output-lang ja
```

Switch providers with one-liners:

```bash
OPENAI_API_KEY=... STYLECT_LLM_PROVIDER=openai \
  stylect run -a "$STYLECT_AUTHOR" -r "$STYLECT_REPO"

ANTHROPIC_API_KEY=... STYLECT_LLM_PROVIDER=anthropic \
  stylect run -a "$STYLECT_AUTHOR" -r "$STYLECT_REPO"

CURSOR_API_KEY=... STYLECT_LLM_PROVIDER=cursor \
  stylect run -a "$STYLECT_AUTHOR" -r "$STYLECT_REPO"
```

If you are not running from the repository clone directory, add `--repo-path /path/to/local/clone` (or set `REPO_SEARCH_PATHS`).

Cache is written to `~/.stylect/<owner__name>/` (`commits.jsonl`, `samples.json`, `meta.json`, and after LLM stages: `extractions.json`, `articles.json`, `lint.json`, `llm-meta.json`).

## Pipeline

```
fetch → sample → extract → compile → lint → write
```

| Stage   | LLM | Description                                      |
|---------|-----|--------------------------------------------------|
| fetch   | no  | Commits + diffs via local git or GitHub API (`--source`) |
| sample  | no  | Cluster by repo × language, pick representatives |
| extract | yes | Style observations per cluster (Phase 2)         |
| compile | yes | Wiki articles / rules (Phase 2)                  |
| lint    | yes | Quality check (Phase 2)                          |
| write   | no  | `wiki/` and `.cursor/rules/` output (Phase 3)    |

Re-runs with no new commits and existing output print `stylect: up to date` and skip LLM/write. Incremental runs only re-extract changed repo×language clusters and evolve affected articles.

Re-write wiki/rules from cache without LLM:

```bash
stylect write -r owner/repo -o ./wiki --rules-dir ./.cursor/rules
```

Debug individual pipeline stages:

```bash
stylect fetch -r owner/repo -a you --repo-path /path/to/local/clone
stylect sample -r owner/repo
```

Select fetch source mode (default: `auto`):

```bash
# Prefer local clone, fallback to GitHub API
stylect run ... --source auto

# Use local clone only (error if not found)
stylect run ... --source local

# Always use GitHub API
stylect run ... --source github
```

Local clone discovery order for `--source auto` / `local`:

1. Per-repo `--repo-path` (repeatable, paired with `--repo`)
2. Current working directory (when git remote matches `owner/repo`)
3. `REPO_SEARCH_PATHS` (colon-separated base directories; each `<base>/<repo-name>`)

Control wiki/rules language (default: English):

```bash
stylect run ... --output-lang ja
# or:
export STYLECT_OUTPUT_LANG=ja
```

Control LLM provider and credentials:

```bash
stylect run ... --llm-provider openai
stylect run ... --llm-provider anthropic
stylect run ... --llm-provider cursor
stylect run ... --llm-provider openai --llm-api-key "$OPENAI_API_KEY"

# or via env:
export STYLECT_LLM_PROVIDER=anthropic
export STYLECT_LLM_API_KEY=...
```

Provider defaults:

| Provider | Default model |
|----------|---------------|
| `cursor` | `composer-2.5` |
| `openai` | `gpt-4.1-mini` |
| `anthropic` | `claude-3-5-sonnet-latest` |

LLM API key resolution order:

1. `--llm-api-key`
2. Provider env var (`CURSOR_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`)
3. `STYLECT_LLM_API_KEY`

## Auth

| Variable         | Purpose                                              |
|------------------|------------------------------------------------------|
| `GITHUB_TOKEN`   | GitHub fetch fallback + repo languages API           |
| `CURSOR_API_KEY` | Cursor SDK auth for extract/compile/lint             |
| `OPENAI_API_KEY` | OpenAI API auth for extract/compile/lint             |
| `ANTHROPIC_API_KEY` | Anthropic API auth for extract/compile/lint       |
| `STYLECT_LLM_PROVIDER` | Default LLM provider (`cursor`, `openai`, `anthropic`) |
| `STYLECT_LLM_API_KEY` | Generic fallback API key for the selected provider |
| `STYLECT_OUTPUT_LANG` | Output language (`en` or `ja`, default: `en`) |
| `REPO_SEARCH_PATHS` | Colon-separated local repo search roots for auto/local source resolution |

`--author` is required for fetch runs. GitHub token is required for `--source github`, or for `--source auto` when no local clone is found (optional otherwise for languages API). If `GITHUB_TOKEN` is not set, stylect also tries `gh auth token`.

### Least-privilege auth

Use the narrowest credential that works for your workflow:

- **Local clone first** — With `--source auto` or `local`, a local git clone avoids GitHub API access for commit fetch. A token is only needed for the languages API fallback.
- **`gh auth login` (recommended for local dev)** — Prefer the GitHub CLI over long-lived tokens. Stylect reads `gh auth token` when `GITHUB_TOKEN` is unset. Use a personal account with access only to the repositories you analyze.
- **Fine-grained `GITHUB_TOKEN`** — If you set `GITHUB_TOKEN` explicitly, use a [fine-grained personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens) scoped to the target repository with **Contents: Read-only** (and **Metadata: Read-only**). Avoid classic tokens with broad `repo` scope unless required.
- **LLM keys** — Grant only the provider you use (`CURSOR_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY`). Do not commit `.env`; copy `.env.example` to `.env` locally.

Never paste tokens into issues, PRs, or shared logs.

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT

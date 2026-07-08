# Stylect

**Learn your coding dialect. Teach it to your agents.**

Stylect mines git history to extract personal or team coding conventions, then
writes agent-ready rules (Cursor `.cursor/rules/`, Orbit personas, wiki).

Part of the [Planetz](https://github.com/guilz-dev/planetz) agent tooling family
alongside [agent-belay](https://github.com/guilz-dev/agent-belay).

## Status

Early development (`1.2.0`). Full pipeline through **write** is implemented, including incremental LLM, cache-only `stylect write`, and debug `stylect fetch` / `sample` subcommands.

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
# Plan only (no fetch)
stylect run \
  --author you \
  --repo owner/repo \
  --repo-path /path/to/local/clone \
  --since 2024-01-01 \
  --plan

# Phase 1: fetch + sample (local git, no LLM token required)
stylect run \
  --author you \
  --repo owner/repo \
  --repo-path /path/to/local/clone \
  --since 2024-01-01 \
  -n 500 \
  -s 10 \
  --skip-llm

# Full pipeline through write (requires CURSOR_API_KEY)
export CURSOR_API_KEY=...
stylect run \
  --author you \
  --repo owner/repo \
  --repo-path /path/to/local/clone \
  -o ./wiki \
  --rules-dir ./.cursor/rules \
  -n 200 -s 5
```

Cache is written to `~/.stylect/<owner__name>/` (`commits.jsonl`, `samples.json`, `meta.json`, and after LLM stages: `extractions.json`, `articles.json`, `lint.json`).

## Pipeline

```
fetch → sample → extract → compile → lint → write
```

| Stage   | LLM | Description                                      |
|---------|-----|--------------------------------------------------|
| fetch   | no  | Commits + diffs via local git (GitHub API later) |
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

## Auth

| Variable         | Purpose                                              |
|------------------|------------------------------------------------------|
| `GITHUB_TOKEN`   | GitHub fetch fallback + repo languages API           |
| `CURSOR_API_KEY` | Cursor SDK for extract/compile/lint (Phase 2)      |

`--author` is required for fetch runs. GitHub token is required for `--source github`, or for `--source auto` when no local clone is found (optional otherwise for languages API).

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

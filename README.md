# Stylect

**Learn your coding dialect. Teach it to your agents.**

Stylect mines git history to extract personal or team coding conventions, then
writes agent-ready rules (Cursor `.cursor/rules/`, Orbit personas, wiki).

Part of the [Planetz](https://github.com/guilz-dev/planetz) agent tooling family
alongside [agent-belay](https://github.com/guilz-dev/agent-belay).

## Status

Early development (`0.1.0`). Phase 1 is implemented: **fetch** (local git) and **sample** with cache. LLM stages are not wired yet.

## Install

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
  --author dev-user \
  --repo owner/repo \
  --repo-path /path/to/local/clone \
  --since 2024-01-01 \
  --plan

# Phase 1: fetch + sample (local git, no token required)
stylect run \
  --author dev-user \
  --repo owner/repo \
  --repo-path /path/to/local/clone \
  --since 2024-01-01 \
  -n 500 \
  -s 10
```

Cache is written to `~/.stylect/<owner__name>/` (`commits.jsonl`, `samples.json`, `meta.json`).

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
| write   | no  | `wiki/` and `.cursor/rules/` output (Phase 2)    |

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

#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { resolveGitHubToken } from './github/token.js'
import { parseArgv } from './parse-args.js'
import { runFetchPipeline } from './pipeline/fetch-stage.js'
import { runPipeline } from './pipeline/run.js'
import { runSamplePipeline } from './pipeline/sample-stage.js'
import { runWritePipeline } from './pipeline/write.js'
import { needsGitHubToken, validateRunConfig } from './util/validate-config.js'
import { validateFetchConfig } from './util/validate-fetch-config.js'
import { validateSampleConfig } from './util/validate-sample-config.js'
import { validateWriteConfig } from './util/validate-write-config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function packageVersion(): string {
  const pkgPath = join(__dirname, '..', 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
  return pkg.version ?? '0.0.0'
}

function printHelp() {
  process.stdout.write(`stylect — coding dialect from git history

Usage:
  stylect run [options]
  stylect fetch [options]
  stylect sample [options]
  stylect write [options]
  stylect --version

Options:
  -a, --author <name>       Filter commits by author (required for fetch)
  -r, --repo <owner/name>   Target repository (repeatable)
      --repo-path <dir>     Local clone path (repeatable, pairs with --repo)
      --since <iso-date>    Only commits after this date
      --until <iso-date>    Only commits before this date
  -n, --max-commits <n>     Max commits to analyze (default: 2000)
  -s, --samples <n>         Samples per repo×language group (default: 20)
  -o, --output <dir>        Wiki output directory (default: ./wiki)
      --rules-dir <dir>     Cursor rules output (default: ./.cursor/rules)
      --cache <dir>         Cache directory (default: ~/.stylect)
      --source <mode>       Fetch source: auto, local, or github (default: auto)
  -t, --token <token>       GitHub token (for languages API / GitHub fetch)
      --model <id>          LLM model for extract/compile/lint (default: composer-2.5)
      --output-lang <lang>  Output language: en or ja (default: en)
      --cursor-api-key <k>  Cursor API key (or set CURSOR_API_KEY)
      --plan                Plan only; skip fetch and later stages
      --dry-run             Alias for --plan (deprecated)
      --fresh               Force full rebuild of repo cache
      --skip-llm            Stop after sample (Phase 1; no LLM stages)
  -h, --help                Show this help

Commands:
  run                       Full pipeline: fetch → sample → LLM → write
  fetch                     Fetch commits to cache (no sampling)
  sample                    Sample clusters from cached commits.jsonl
  write                     Write wiki/rules from cached articles.json (no LLM)

Examples:
  stylect run -r owner/repo -a you --repo-path /path/to/clone
  stylect fetch -r owner/repo -a you --repo-path /path/to/clone
  stylect sample -r owner/repo
  stylect write -r owner/repo -o ./wiki --rules-dir ./.cursor/rules
`)
}

async function main() {
  try {
    const parsed = parseArgv(process.argv.slice(2))

    if (parsed.command === 'help') {
      printHelp()
      return
    }

    if (parsed.command === 'version') {
      process.stdout.write(`stylect ${packageVersion()}\n`)
      return
    }

    if (parsed.command === 'write') {
      validateWriteConfig(parsed.config)
      const result = await runWritePipeline(parsed.config)
      if (result.lintFailed || result.llmPartialFailure) {
        process.exitCode = 1
      }
      return
    }

    if (parsed.command === 'fetch' || parsed.command === 'sample') {
      const needsGitHub = needsGitHubToken(parsed.config)
      if (needsGitHub) {
        const token = await resolveGitHubToken(parsed.config.githubToken)
        if (!token) {
          throw new Error(
            'GitHub token required when using --source github or when no local clone is found. Set GITHUB_TOKEN, pass --token, or run `gh auth login`.',
          )
        }
        parsed.config.githubToken = token
      } else if (parsed.config.githubToken) {
        parsed.config.githubToken = await resolveGitHubToken(parsed.config.githubToken)
      } else {
        const token = await resolveGitHubToken()
        if (token) {
          parsed.config.githubToken = token
        }
      }

      if (parsed.command === 'fetch') {
        validateFetchConfig(parsed.config)
        validateRunConfig(parsed.config)
        await runFetchPipeline(parsed.config)
        return
      }

      validateSampleConfig(parsed.config)
      await runSamplePipeline(parsed.config)
      return
    }

    const needsGitHub = needsGitHubToken(parsed.config)

    if (needsGitHub && !parsed.config.plan) {
      const token = await resolveGitHubToken(parsed.config.githubToken)
      if (!token) {
        throw new Error(
          'GitHub token required when using --source github or when no local clone is found. Set GITHUB_TOKEN, pass --token, or run `gh auth login`.',
        )
      }
      parsed.config.githubToken = token
    } else if (parsed.config.githubToken) {
      parsed.config.githubToken = await resolveGitHubToken(parsed.config.githubToken)
    } else {
      const token = await resolveGitHubToken()
      if (token) {
        parsed.config.githubToken = token
      }
    }

    validateRunConfig(parsed.config)

    const result = await runPipeline(parsed.config)
    if (result.lintFailed || result.llmPartialFailure) {
      process.exitCode = 1
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}

await main()

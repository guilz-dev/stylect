import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import type { FetchResult } from '../models/cluster.js'
import { perRepoLimit, repoCacheDir } from '../util/repo-path.js'
import { requireAuthor } from '../util/require-author.js'
import {
  assertCacheAuthor,
  cachedLanguages,
  latestAuthoredAt,
  loadCommits,
  loadMeta,
  mergeCommits,
} from './cache.js'
import { fetchCommitsFromGitHub } from './github.js'
import { fetchCommitsFromLocalGit } from './local-git.js'
import { buildFetchResult, persistFetchResult } from './result.js'
import { type ResolvedSource, resolveFetchSource } from './source.js'
import type { FetchCommitsOptions, KnownLanguages } from './types.js'

export async function fetch(repo: string, config: StylectConfig): Promise<FetchResult> {
  const cacheDir = repoCacheDir(config, repo)
  const commitsPath = join(cacheDir, 'commits.jsonl')
  const metaPath = join(cacheDir, 'meta.json')

  if (config.fresh && existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true })
  }

  const source = resolveFetchSource(config, repo)
  if (source.kind === 'github' && !config.githubToken) {
    throw new Error(
      'GitHub token required when no local clone is found. Set GITHUB_TOKEN, pass --token, or run `gh auth login`.',
    )
  }

  const perRepo = perRepoLimit(config)
  const paths = { commitsPath, metaPath }

  if (existsSync(commitsPath) && !config.fresh) {
    const existing = loadCommits(commitsPath)
    if (existing.length > 0) {
      return fetchIncremental(repo, source, config, {
        paths,
        existing,
        perRepo,
      })
    }
  }

  return fetchFresh(repo, source, config, { paths, perRepo })
}

async function fetchCommits(
  repo: string,
  source: ResolvedSource,
  config: StylectConfig,
  opts: FetchCommitsOptions,
) {
  if (source.kind === 'local-git') {
    return fetchCommitsFromLocalGit(repo, source.path, config, opts)
  }
  return fetchCommitsFromGitHub(repo, config, opts)
}

async function fetchFresh(
  repo: string,
  source: ResolvedSource,
  config: StylectConfig,
  opts: {
    paths: { commitsPath: string; metaPath: string }
    perRepo: number
  },
): Promise<FetchResult> {
  const { commits, languageSource } = await fetchCommits(repo, source, config, {
    perRepoLimit: opts.perRepo,
  })

  if (commits.length === 0) {
    return buildFetchResult(source, [], [], 'unknown', false)
  }

  const author = requireAuthor(config)
  persistFetchResult(opts.paths, source, { author, language_source: languageSource }, commits)

  return buildFetchResult(source, commits, commits, languageSource, false)
}

async function fetchIncremental(
  repo: string,
  source: ResolvedSource,
  config: StylectConfig,
  opts: {
    paths: { commitsPath: string; metaPath: string }
    existing: ReturnType<typeof loadCommits>
    perRepo: number
  },
): Promise<FetchResult> {
  const author = requireAuthor(config)
  const meta = loadMeta(opts.paths.metaPath)
  assertCacheAuthor(meta, author, repo)

  const since = latestAuthoredAt(opts.existing)
  const languages = cachedLanguages(opts.existing)
  const knownLanguages: KnownLanguages | undefined =
    meta && languages ? { languages, source: meta.language_source } : undefined

  const { commits: fetched, languageSource } = await fetchCommits(repo, source, config, {
    since,
    perRepoLimit: opts.perRepo,
    knownLanguages,
  })

  const existingShas = new Set(opts.existing.map((commit) => commit.sha))
  const newCommits = fetched.filter((commit) => !existingShas.has(commit.sha))

  if (newCommits.length === 0) {
    return buildFetchResult(source, opts.existing, [], meta?.language_source ?? 'unknown', true)
  }

  const merged = mergeCommits(opts.existing, newCommits)
  persistFetchResult(opts.paths, source, { author, language_source: languageSource }, merged)

  return buildFetchResult(source, merged, newCommits, languageSource, true)
}

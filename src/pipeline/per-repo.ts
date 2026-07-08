import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { compileWiki } from '../compile/index.js'
import type { StylectConfig } from '../config.js'
import { deltaExtractions, extractClusters } from '../extract/index.js'
import { loadSamples } from '../fetch/cache.js'
import { fetch } from '../fetch/index.js'
import { lintWiki } from '../lint/index.js'
import { extractionsPath, loadExtractions } from '../llm/cache.js'
import type { LlmConfig } from '../llm/cursor.js'
import { resolveCursorApiKey } from '../llm/token.js'
import type { SampledCluster } from '../models/cluster.js'
import { findDeltaClusters } from '../sample/delta.js'
import { sampleCommits } from '../sample/index.js'
import { needsCursorApiKey } from '../util/llm-requirements.js'
import { perRepoLimit, repoToSlug } from '../util/repo-path.js'
import { logLlmSummary, logSampleSummary } from './log.js'
import type { RepoLlmResult } from './types.js'

export type PerRepoOutcome = {
  result: RepoLlmResult
  lintFailed: boolean
  llmPartialFailure: boolean
}

export async function processRepo(repo: string, config: StylectConfig): Promise<PerRepoOutcome> {
  const slug = repoToSlug(repo)
  const repoCacheDir = join(config.cacheDir, slug)
  const repoConfig = { ...config, maxCommits: perRepoLimit(config) }
  const fetchResult = await fetch(repo, repoConfig)
  const newCommitCount = fetchResult.newCommits.length
  const samplesPath = join(repoCacheDir, 'samples.json')
  const previousClusters = loadPreviousClusters(samplesPath, newCommitCount, config.fresh)

  const sampleResult = sampleCommits(fetchResult.allCommits, repoConfig, {
    slug,
    newCommitCount,
  })

  const deltaClusters = previousClusters
    ? findDeltaClusters(previousClusters, sampleResult.clusters)
    : sampleResult.clusters

  assertClustersNonEmpty(repo, sampleResult.clusters)

  const llmOpts = {
    slug,
    newCommitCount,
    deltaClusterCount: deltaClusters.length,
  }

  if (config.skipLlm) {
    logSampleSummary(repo, fetchResult, sampleResult.clusters, repoCacheDir)
    return emptyOutcome(repo, 'skipped-llm', newCommitCount)
  }

  if (needsCursorApiKey(config, llmOpts)) {
    const apiKey = resolveCursorApiKey(config.cursorApiKey)
    if (!apiKey) {
      process.stderr.write(
        `stylect: no CURSOR_API_KEY; stopping after sample for ${repo}. ` +
          'Set CURSOR_API_KEY or pass --skip-llm to suppress this message.\n',
      )
      logSampleSummary(repo, fetchResult, sampleResult.clusters, repoCacheDir)
      return emptyOutcome(repo, 'skipped-no-key', newCommitCount)
    }
  }

  const llm = resolveLlmConfig(config, llmOpts)
  let llmPartialFailure = false

  const previousExtractions =
    previousClusters && existsSync(extractionsPath(repoCacheDir))
      ? loadExtractions(extractionsPath(repoCacheDir))
      : []

  const extractResult = await extractClusters(sampleResult.clusters, repoConfig, {
    slug,
    newCommitCount,
    llm,
    previousClusters,
  })

  if (extractResult.skippedClusters > 0) {
    llmPartialFailure = true
  }

  const compileDeltaExtractions =
    previousExtractions.length > 0 && previousClusters
      ? deltaExtractions(extractResult.extractions, previousExtractions, deltaClusters)
      : extractResult.extractions

  const compileResult = await compileWiki(extractResult.extractions, repoConfig, {
    slug,
    newCommitCount,
    llm,
    deltaExtractions: compileDeltaExtractions,
  })

  if (compileResult.failedSlugs.length > 0) {
    llmPartialFailure = true
  }

  const lintResult = await lintWiki(compileResult.articles, repoConfig, {
    slug,
    newCommitCount: extractResult.fromCache && compileResult.fromCache ? 0 : newCommitCount,
    llm,
  })

  logLlmSummary(
    repo,
    fetchResult,
    sampleResult.clusters,
    extractResult,
    compileResult,
    lintResult,
    repoCacheDir,
  )

  const upToDate =
    (newCommitCount === 0 || deltaClusters.length === 0) &&
    extractResult.fromCache &&
    compileResult.fromCache &&
    lintResult.fromCache

  return {
    result: {
      repo,
      status: 'complete',
      articles: compileResult.articles,
      lint: lintResult.report,
      newCommitCount,
      upToDate,
    },
    lintFailed: !lintResult.report.passed,
    llmPartialFailure,
  }
}

function loadPreviousClusters(
  samplesPath: string,
  newCommitCount: number,
  fresh: boolean,
): SampledCluster[] | undefined {
  if (newCommitCount === 0 || fresh || !existsSync(samplesPath)) {
    return undefined
  }
  return loadSamples(samplesPath)
}

function emptyOutcome(
  repo: string,
  status: RepoLlmResult['status'],
  newCommitCount: number,
): PerRepoOutcome {
  return {
    result: {
      repo,
      status,
      articles: [],
      lint: { passed: true, issues: [] },
      newCommitCount,
      upToDate: false,
    },
    lintFailed: false,
    llmPartialFailure: false,
  }
}

function resolveLlmConfig(
  config: StylectConfig,
  opts: { slug: string; newCommitCount: number; deltaClusterCount: number },
): LlmConfig {
  if (!needsCursorApiKey(config, opts)) {
    return { apiKey: config.cursorApiKey ?? '', model: config.model }
  }

  const apiKey = resolveCursorApiKey(config.cursorApiKey)
  if (!apiKey) {
    throw new Error(
      'CURSOR_API_KEY required for extract/compile/lint. Set CURSOR_API_KEY, pass --cursor-api-key, or use --skip-llm.',
    )
  }

  return { apiKey, model: config.model }
}

function assertClustersNonEmpty(repo: string, clusters: SampledCluster[]): void {
  if (clusters.length === 0) {
    throw new Error(
      `No sampled clusters for ${repo}. Check --author, date range, or commit history.`,
    )
  }
}

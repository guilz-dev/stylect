import { join } from 'node:path'

import { compileWiki } from '../compile/index.js'
import type { StylectConfig } from '../config.js'
import { extractClusters } from '../extract/index.js'
import { fetch } from '../fetch/index.js'
import { lintWiki } from '../lint/index.js'
import { invalidateAllLlmCache } from '../llm/cache.js'
import type { LlmConfig } from '../llm/cursor.js'
import { resolveCursorApiKey } from '../llm/token.js'
import type { FetchResult, SampledCluster } from '../models/cluster.js'
import type { LintReport } from '../models/lint-report.js'
import { sampleCommits } from '../sample/index.js'
import { needsCursorApiKey } from '../util/llm-requirements.js'
import { perRepoLimit, repoToSlug } from '../util/repo-path.js'
import { requireAuthor } from '../util/require-author.js'

export type PipelinePlan = {
  stages: string[]
  llmStages: string[]
  estimatedClusters: number
  config: StylectConfig
}

/** Build a plan without touching git or LLM APIs. */
export function planPipeline(config: StylectConfig): PipelinePlan {
  const stages = config.skipLlm
    ? ['fetch', 'sample']
    : ['fetch', 'sample', 'extract', 'compile', 'lint', 'write']
  const llmStages = config.plan || config.skipLlm ? [] : ['extract', 'compile', 'lint']
  const repos = config.repos.length
  const estimatedClusters = Math.max(repos, 1) * 2

  return {
    stages,
    llmStages,
    estimatedClusters,
    config,
  }
}

export function formatPlan(plan: PipelinePlan): string {
  const lines = [
    'stylect pipeline plan',
    '',
    `repos: ${plan.config.repos.join(', ')}`,
    plan.config.author ? `author: ${plan.config.author}` : 'author: (required in Phase 1)',
    `max commits: ${plan.config.maxCommits}`,
    `samples per group: ${plan.config.samplesPerGroup}`,
    `model: ${plan.config.model}`,
    `skip LLM: ${plan.config.skipLlm}`,
    `output: ${plan.config.outputDir}`,
    `cache: ${plan.config.cacheDir}`,
    `source: ${plan.config.source}`,
    `plan: ${plan.config.plan}`,
    '',
    `stages: ${plan.stages.join(' → ')}`,
    plan.llmStages.length > 0
      ? `LLM stages: ${plan.llmStages.join(', ')}`
      : plan.config.skipLlm
        ? 'LLM stages: skipped (--skip-llm)'
        : 'LLM stages: skipped (plan mode)',
    `estimated clusters: ~${plan.estimatedClusters}`,
  ]
  if (!plan.config.skipLlm) {
    lines.push('write: not implemented (Phase 3)')
  }
  return `${lines.join('\n')}\n`
}

export type PipelineRunResult = {
  lintFailed: boolean
  llmSkipped: boolean
  llmPartialFailure: boolean
}

export async function runPipeline(config: StylectConfig): Promise<PipelineRunResult> {
  if (config.plan) {
    process.stdout.write(formatPlan(planPipeline(config)))
    return { lintFailed: false, llmSkipped: false, llmPartialFailure: false }
  }

  requireAuthor(config)

  const result: PipelineRunResult = {
    lintFailed: false,
    llmSkipped: false,
    llmPartialFailure: false,
  }

  for (const repo of config.repos) {
    const slug = repoToSlug(repo)
    const repoCacheDir = join(config.cacheDir, slug)
    const repoConfig = { ...config, maxCommits: perRepoLimit(config) }
    const fetchResult = await fetch(repo, repoConfig)
    const newCommitCount = fetchResult.newCommits.length
    const sampleResult = sampleCommits(fetchResult.allCommits, repoConfig, {
      slug,
      newCommitCount,
    })

    if (!sampleResult.fromCache) {
      invalidateAllLlmCache(repoCacheDir)
    }

    assertClustersNonEmpty(repo, sampleResult.clusters)

    const llmOpts = {
      slug,
      newCommitCount,
      samplesRecalculated: !sampleResult.fromCache,
    }

    if (config.skipLlm) {
      logSampleSummary(repo, fetchResult, sampleResult.clusters, repoCacheDir)
      result.llmSkipped = true
      continue
    }

    if (needsCursorApiKey(config, llmOpts)) {
      const apiKey = resolveCursorApiKey(config.cursorApiKey)
      if (!apiKey) {
        process.stderr.write(
          `stylect: no CURSOR_API_KEY; stopping after sample for ${repo}. ` +
            'Set CURSOR_API_KEY or pass --skip-llm to suppress this message.\n',
        )
        logSampleSummary(repo, fetchResult, sampleResult.clusters, repoCacheDir)
        result.llmSkipped = true
        continue
      }
    }

    const llm = resolveLlmConfig(config, llmOpts)

    const extractResult = await extractClusters(sampleResult.clusters, repoConfig, {
      slug,
      newCommitCount,
      llm,
    })

    if (extractResult.skippedClusters > 0) {
      result.llmPartialFailure = true
    }

    const compileResult = await compileWiki(extractResult.extractions, repoConfig, {
      slug,
      newCommitCount,
      llm,
    })

    if (compileResult.failedSlugs.length > 0) {
      result.llmPartialFailure = true
    }

    const lintResult = await lintWiki(compileResult.articles, repoConfig, {
      slug,
      newCommitCount,
      llm,
    })

    if (!lintResult.report.passed) {
      result.lintFailed = true
    }

    logSummary(
      repo,
      fetchResult,
      sampleResult.clusters,
      extractResult,
      compileResult,
      lintResult,
      repoCacheDir,
    )
  }

  return result
}

function resolveLlmConfig(
  config: StylectConfig,
  opts: { slug: string; newCommitCount: number; samplesRecalculated: boolean },
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

function logSampleSummary(
  repo: string,
  fetchResult: FetchResult,
  clusters: SampledCluster[],
  cacheDir: string,
): void {
  const clusterSummary = summarizeClusters(clusters)
  const sampledCount = clusters.reduce((sum, cluster) => sum + cluster.commits.length, 0)
  const newLabel =
    fetchResult.newCommits.length > 0
      ? `${fetchResult.allCommits.length} commits (${fetchResult.newCommits.length} new)`
      : `${fetchResult.allCommits.length} commits`

  const lines = [
    `repo: ${repo}`,
    `source: ${fetchResult.source}${fetchResult.sourcePath ? ` (${fetchResult.sourcePath})` : ''}`,
    `language_source: ${fetchResult.languageSource}`,
    `fetched: ${newLabel}`,
    `clusters: ${clusters.length}${clusterSummary ? ` (${clusterSummary})` : ''}`,
    `sampled: ${sampledCount} commits → ${join(cacheDir, 'samples.json')}`,
    '',
  ]
  process.stdout.write(lines.join('\n'))
}

function logSummary(
  repo: string,
  fetchResult: FetchResult,
  clusters: SampledCluster[],
  extractResult: Awaited<ReturnType<typeof extractClusters>>,
  compileResult: Awaited<ReturnType<typeof compileWiki>>,
  lintResult: { report: LintReport; fromCache: boolean },
  cacheDir: string,
): void {
  const clusterSummary = summarizeClusters(clusters)
  const sampledCount = clusters.reduce((sum, cluster) => sum + cluster.commits.length, 0)
  const observationCount = extractResult.extractions.reduce(
    (sum, ext) => sum + ext.observations.length,
    0,
  )
  const newLabel =
    fetchResult.newCommits.length > 0
      ? `${fetchResult.allCommits.length} commits (${fetchResult.newCommits.length} new)`
      : `${fetchResult.allCommits.length} commits`

  const lines = [
    `repo: ${repo}`,
    `source: ${fetchResult.source}${fetchResult.sourcePath ? ` (${fetchResult.sourcePath})` : ''}`,
    `language_source: ${fetchResult.languageSource}`,
    `fetched: ${newLabel}`,
    `clusters: ${clusters.length}${clusterSummary ? ` (${clusterSummary})` : ''}`,
    `sampled: ${sampledCount} commits → ${join(cacheDir, 'samples.json')}`,
    `extracted: ${observationCount} observations${extractResult.fromCache ? ' (cached)' : ''}${extractResult.skippedClusters > 0 ? `, ${extractResult.skippedClusters} clusters skipped` : ''} → ${join(cacheDir, 'extractions.json')}`,
    `compiled: ${compileResult.articles.length} articles${compileResult.fromCache ? ' (cached)' : ''} → ${join(cacheDir, 'articles.json')}`,
    `lint: ${lintResult.report.passed ? 'passed' : `${lintResult.report.issues.length} issues`}${lintResult.fromCache ? ' (cached)' : ''} → ${join(cacheDir, 'lint.json')}`,
    '',
  ]
  process.stdout.write(lines.join('\n'))
}

function summarizeClusters(clusters: SampledCluster[]): string {
  const counts = new Map<string, number>()
  for (const cluster of clusters) {
    const key = cluster.language.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([language, count]) => `${language}×${count}`).join(', ')
}

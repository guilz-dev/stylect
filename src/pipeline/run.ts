import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import { fetch } from '../fetch/index.js'
import type { FetchResult, SampledCluster } from '../models/cluster.js'
import { sampleCommits } from '../sample/index.js'
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
  const stages = ['fetch', 'sample', 'extract', 'compile', 'lint', 'write']
  const llmStages = config.plan ? [] : ['extract', 'compile', 'lint']
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
    `output: ${plan.config.outputDir}`,
    `cache: ${plan.config.cacheDir}`,
    `source: ${plan.config.source}`,
    `plan: ${plan.config.plan}`,
    '',
    `stages: ${plan.stages.join(' → ')}`,
    plan.llmStages.length > 0
      ? `LLM stages: ${plan.llmStages.join(', ')}`
      : 'LLM stages: skipped (plan mode)',
    `estimated clusters: ~${plan.estimatedClusters}`,
  ]
  return `${lines.join('\n')}\n`
}

export async function runPipeline(config: StylectConfig): Promise<void> {
  if (config.plan) {
    process.stdout.write(formatPlan(planPipeline(config)))
    return
  }

  requireAuthor(config)

  for (const repo of config.repos) {
    const slug = repoToSlug(repo)
    const repoConfig = { ...config, maxCommits: perRepoLimit(config) }
    const fetchResult = await fetch(repo, repoConfig)
    const clusters = sampleCommits(fetchResult.allCommits, repoConfig, {
      slug,
      newCommitCount: fetchResult.newCommits.length,
    })
    logSummary(repo, fetchResult, clusters, join(config.cacheDir, slug))
  }
}

function logSummary(
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

function summarizeClusters(clusters: SampledCluster[]): string {
  const counts = new Map<string, number>()
  for (const cluster of clusters) {
    const key = cluster.language.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([language, count]) => `${language}×${count}`).join(', ')
}

import { join } from 'node:path'

import type { FetchResult, SampledCluster } from '../models/cluster.js'
import type { LintReport } from '../models/lint-report.js'
import type { WriteResult } from '../writer/types.js'

export function logFetchSummary(repo: string, fetchResult: FetchResult, cacheDir: string): void {
  const newLabel =
    fetchResult.newCommits.length > 0
      ? `${fetchResult.allCommits.length} commits (${fetchResult.newCommits.length} new)`
      : `${fetchResult.allCommits.length} commits`

  const lines = [
    `repo: ${repo}`,
    `source: ${fetchResult.source}${fetchResult.sourcePath ? ` (${fetchResult.sourcePath})` : ''}`,
    `language_source: ${fetchResult.languageSource}`,
    `fetched: ${newLabel}`,
    `cache: ${join(cacheDir, 'commits.jsonl')}`,
    '',
  ]
  process.stdout.write(lines.join('\n'))
}

export function logSampleSummary(
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

export function logLlmSummary(
  repo: string,
  fetchResult: FetchResult,
  clusters: SampledCluster[],
  extractResult: {
    extractions: { observations: unknown[] }[]
    fromCache: boolean
    skippedClusters: number
  },
  compileResult: { articles: unknown[]; fromCache: boolean },
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

export function logWriteSummary(result: WriteResult): void {
  const lines = [
    `write: ${result.wikiFiles} wiki files → ${result.wikiDir}`,
    `write: ${result.rulesFiles} rule files → ${result.rulesDir}`,
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

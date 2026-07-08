import type { StylectConfig } from '../config.js'
import { requireAuthor } from '../util/require-author.js'
import { cleanupAllOutputArtifacts } from '../writer/cleanup.js'
import {
  mergeRepoArtifacts,
  shouldCleanupEmptyOutput,
  shouldWrite,
  writeArtifacts,
} from '../writer/index.js'
import { logWriteSummary } from './log.js'
import { processRepo } from './per-repo.js'
import type { PipelinePlan, PipelineRunResult, RepoLlmResult } from './types.js'
import { outputArtifactsExist } from './up-to-date.js'

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
    `rules: ${plan.config.rulesDir}`,
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

  if (!plan.config.skipLlm && !plan.config.plan) {
    lines.push(`write wiki: ${plan.config.writeWiki} → ${plan.config.outputDir}`)
    lines.push(`write rules: ${plan.config.writeRules} → ${plan.config.rulesDir}`)
  }

  return `${lines.join('\n')}\n`
}

export type { PipelinePlan, PipelineRunResult, RepoLlmResult } from './types.js'

export async function runPipeline(config: StylectConfig): Promise<PipelineRunResult> {
  if (config.plan) {
    process.stdout.write(formatPlan(planPipeline(config)))
    return {
      lintFailed: false,
      llmSkipped: false,
      llmPartialFailure: false,
      repoResults: [],
      wroteArtifacts: false,
    }
  }

  requireAuthor(config)

  const repoResults: RepoLlmResult[] = []
  let lintFailed = false
  let llmPartialFailure = false

  for (const repo of config.repos) {
    try {
      const outcome = await processRepo(repo, config)
      repoResults.push(outcome.result)
      if (outcome.lintFailed) {
        lintFailed = true
      }
      if (outcome.llmPartialFailure) {
        llmPartialFailure = true
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`stylect: skipping ${repo} after error: ${message}\n`)
      repoResults.push({
        repo,
        status: 'skipped-error',
        articles: [],
        lint: { passed: true, issues: [] },
        newCommitCount: 0,
        upToDate: false,
      })
      llmPartialFailure = true
    }
  }

  let wroteArtifacts = false
  const pipelineUpToDate =
    !config.skipLlm &&
    repoResults.length > 0 &&
    repoResults.every((result) => result.status === 'complete' && result.upToDate) &&
    outputArtifactsExist(config)

  if (pipelineUpToDate) {
    process.stdout.write('stylect: up to date\n')
  } else if (shouldWrite(config, repoResults)) {
    const merged = mergeRepoArtifacts(repoResults)
    const writeResult = writeArtifacts(merged, config)
    logWriteSummary(writeResult)
    wroteArtifacts = true
  } else if (shouldCleanupEmptyOutput(config, repoResults)) {
    process.stderr.write('stylect: no articles to write; clearing stale output.\n')
    cleanupAllOutputArtifacts(config)
    wroteArtifacts = true
  }

  const llmSkipped = repoResults.every((result) => result.status !== 'complete')

  return {
    lintFailed,
    llmPartialFailure,
    repoResults,
    wroteArtifacts,
    llmSkipped,
  }
}

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import { articlesPath, lintPath, loadArticles, loadLint } from '../llm/cache.js'
import { repoToSlug } from '../util/repo-path.js'
import { cleanupAllOutputArtifacts } from '../writer/cleanup.js'
import { mergeRepoArtifacts, writeArtifacts } from '../writer/index.js'
import { logWriteSummary } from './log.js'
import type { PipelineRunResult, RepoLlmResult } from './types.js'

export function loadCachedRepoResult(repo: string, cacheDir: string): RepoLlmResult {
  const repoCacheDir = join(cacheDir, repoToSlug(repo))
  const articlesFile = articlesPath(repoCacheDir)

  if (!existsSync(articlesFile)) {
    throw new Error(`No cached articles for ${repo}. Run \`stylect run\` first (${articlesFile})`)
  }

  const articles = loadArticles(articlesFile)
  const lintFile = lintPath(repoCacheDir)
  const lint = existsSync(lintFile) ? loadLint(lintFile) : { passed: true, issues: [] }

  return {
    repo,
    status: 'complete',
    articles,
    lint,
    newCommitCount: 0,
    upToDate: false,
  }
}

export async function runWritePipeline(config: StylectConfig): Promise<PipelineRunResult> {
  const repoResults: RepoLlmResult[] = []
  let lintFailed = false
  let llmPartialFailure = false

  for (const repo of config.repos) {
    try {
      const result = loadCachedRepoResult(repo, config.cacheDir)
      repoResults.push(result)
      if (!result.lint.passed) {
        lintFailed = true
      }
      process.stdout.write(
        `cache: ${repo} → ${result.articles.length} articles, lint ${result.lint.passed ? 'passed' : `${result.lint.issues.length} issues`}\n`,
      )
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
  const complete = repoResults.filter((result) => result.status === 'complete')
  const totalArticles = complete.reduce((sum, result) => sum + result.articles.length, 0)

  if (totalArticles > 0) {
    const merged = mergeRepoArtifacts(repoResults)
    const writeResult = writeArtifacts(merged, config)
    logWriteSummary(writeResult)
    wroteArtifacts = true
  } else if (complete.length > 0) {
    process.stderr.write('stylect: no articles to write; clearing stale output.\n')
    cleanupAllOutputArtifacts(config)
    wroteArtifacts = true
  }

  return {
    lintFailed,
    llmPartialFailure,
    repoResults,
    wroteArtifacts,
    llmSkipped: false,
  }
}

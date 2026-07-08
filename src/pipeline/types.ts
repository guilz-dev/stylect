import type { StylectConfig } from '../config.js'
import type { WikiArticle } from '../models/article.js'
import type { LintReport } from '../models/lint-report.js'

export type RepoLlmStatus = 'complete' | 'skipped-llm' | 'skipped-no-key' | 'skipped-error'

export type RepoLlmResult = {
  repo: string
  status: RepoLlmStatus
  articles: WikiArticle[]
  lint: LintReport
  newCommitCount: number
  upToDate: boolean
}

export type PipelinePlan = {
  stages: string[]
  llmStages: string[]
  estimatedClusters: number
  config: StylectConfig
}

export type PipelineRunResult = {
  lintFailed: boolean
  llmPartialFailure: boolean
  repoResults: RepoLlmResult[]
  wroteArtifacts: boolean
  /** @deprecated Use repoResults for per-repo status */
  llmSkipped: boolean
}

import type { StylectConfig } from '../config.js'
import type { WikiArticle } from '../models/article.js'
import type { LintReport } from '../models/lint-report.js'

export type MergedArtifacts = {
  articles: WikiArticle[]
  lint: LintReport
  sourceRepos: string[]
  mergeLog: string[]
}

export type WriteResult = {
  wikiDir: string
  rulesDir: string
  wikiFiles: number
  rulesFiles: number
}

export type WriteOptions = {
  config: StylectConfig
  merged: MergedArtifacts
}

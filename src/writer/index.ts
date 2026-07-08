import type { StylectConfig } from '../config.js'
import type { RepoLlmResult } from '../pipeline/types.js'
import { writeCursorRules } from './cursor-rules.js'
import type { MergedArtifacts, WriteResult } from './types.js'
import { writeWiki } from './wiki.js'

export function shouldWrite(config: StylectConfig, repoResults: RepoLlmResult[]): boolean {
  if (config.plan || config.skipLlm) {
    return false
  }

  const complete = repoResults.filter((result) => result.status === 'complete')
  if (complete.length === 0) {
    return false
  }

  const totalArticles = complete.reduce((sum, result) => sum + result.articles.length, 0)
  return totalArticles > 0
}

export function writeArtifacts(merged: MergedArtifacts, config: StylectConfig): WriteResult {
  let wikiFiles = 0
  let rulesFiles = 0
  let wikiDir = config.outputDir
  let rulesDir = config.rulesDir

  if (config.writeWiki) {
    const wiki = writeWiki(merged, config)
    wikiDir = wiki.dir
    wikiFiles = wiki.fileCount
  }

  if (config.writeRules) {
    const rules = writeCursorRules(merged, config)
    rulesDir = rules.dir
    rulesFiles = rules.fileCount
  }

  return { wikiDir, rulesDir, wikiFiles, rulesFiles }
}

export function shouldCleanupEmptyOutput(
  config: StylectConfig,
  repoResults: RepoLlmResult[],
): boolean {
  if (config.plan || config.skipLlm) {
    return false
  }

  const complete = repoResults.filter((result) => result.status === 'complete')
  if (complete.length === 0) {
    return false
  }

  const totalArticles = complete.reduce((sum, result) => sum + result.articles.length, 0)
  return totalArticles === 0
}

export { cleanupAllOutputArtifacts } from './cleanup.js'

export { mergeRepoArtifacts } from './merge.js'
export type { MergedArtifacts, WriteResult } from './types.js'

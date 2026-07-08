import type { StylectConfig } from '../config.js'
import { fetch } from '../fetch/index.js'
import { perRepoLimit, repoCacheDir } from '../util/repo-path.js'
import { requireAuthor } from '../util/require-author.js'
import { logFetchSummary } from './log.js'

export async function runFetchPipeline(config: StylectConfig): Promise<void> {
  requireAuthor(config)

  for (const repo of config.repos) {
    const repoConfig = { ...config, maxCommits: perRepoLimit(config) }
    const fetchResult = await fetch(repo, repoConfig)
    logFetchSummary(repo, fetchResult, repoCacheDir(config, repo))
  }
}

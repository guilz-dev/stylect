import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import { loadCommits, loadMeta } from '../fetch/cache.js'
import type { FetchResult } from '../models/cluster.js'
import { sampleCommits } from '../sample/index.js'
import { repoCacheDir, repoToSlug } from '../util/repo-path.js'
import { logSampleSummary } from './log.js'

export async function runSamplePipeline(config: StylectConfig): Promise<void> {
  for (const repo of config.repos) {
    const slug = repoToSlug(repo)
    const cacheDir = repoCacheDir(config, repo)
    const commitsPath = join(cacheDir, 'commits.jsonl')

    if (!existsSync(commitsPath)) {
      throw new Error(`No cached commits for ${repo}. Run \`stylect fetch\` first (${commitsPath})`)
    }

    const commits = loadCommits(commitsPath)
    if (commits.length === 0) {
      throw new Error(`Cached commits for ${repo} are empty (${commitsPath})`)
    }

    const sampleResult = sampleCommits(commits, config, {
      slug,
      newCommitCount: config.fresh ? commits.length : 0,
    })

    if (sampleResult.clusters.length === 0) {
      throw new Error(`No sampled clusters for ${repo}. Check commit cache.`)
    }

    const meta = loadMeta(join(cacheDir, 'meta.json'))
    const fetchResult: FetchResult = {
      allCommits: commits,
      newCommits: [],
      isIncremental: false,
      source: meta?.source ?? 'local-git',
      sourcePath: meta?.source_path,
      languageSource: meta?.language_source ?? 'unknown',
    }

    const cacheLabel = sampleResult.fromCache ? ' (cached)' : ''
    process.stdout.write(`sample${cacheLabel}: ${repo}\n`)
    logSampleSummary(repo, fetchResult, sampleResult.clusters, cacheDir)
  }
}

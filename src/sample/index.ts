import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import { loadSamples, saveSamples } from '../fetch/cache.js'
import type { SampledCluster } from '../models/cluster.js'
import type { RawCommit } from '../models/commit.js'
import { shouldUseCache } from '../util/cache-policy.js'
import { sampleGroup } from './select.js'

export type SampleResult = {
  clusters: SampledCluster[]
  fromCache: boolean
}

export function shouldUseSampleCache(
  fresh: boolean,
  cacheExists: boolean,
  newCommitCount: number,
): boolean {
  return shouldUseCache(fresh, cacheExists, newCommitCount)
}

export function buildClusters(commits: RawCommit[], samplesPerGroup: number): SampledCluster[] {
  const groups = new Map<string, RawCommit[]>()

  for (const commit of commits) {
    const languages = commit.languages.length > 0 ? commit.languages : ['unknown']
    for (const language of languages) {
      const key = `${commit.repo}\0${language}`
      const group = groups.get(key) ?? []
      group.push(commit)
      groups.set(key, group)
    }
  }

  const clusters: SampledCluster[] = []
  for (const [key, groupCommits] of groups) {
    const separator = key.indexOf('\0')
    if (separator < 0) {
      continue
    }
    const repo = key.slice(0, separator)
    const language = key.slice(separator + 1)
    const sampled = sampleGroup(groupCommits, samplesPerGroup)
    clusters.push({
      repo,
      language,
      commits: sampled,
      totalInGroup: groupCommits.length,
    })
  }

  return clusters
}

export function sampleCommits(
  commits: RawCommit[],
  config: StylectConfig,
  opts: { slug: string; newCommitCount: number },
): SampleResult {
  const samplesPath = join(config.cacheDir, opts.slug, 'samples.json')
  const cacheExists = existsSync(samplesPath)

  if (shouldUseSampleCache(config.fresh, cacheExists, opts.newCommitCount)) {
    return { clusters: loadSamples(samplesPath), fromCache: true }
  }

  const clusters = buildClusters(commits, config.samplesPerGroup)
  if (clusters.length > 0) {
    saveSamples(samplesPath, clusters)
  }

  return { clusters, fromCache: false }
}

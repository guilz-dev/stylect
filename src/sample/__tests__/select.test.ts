import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { defaultConfig } from '../../config.js'
import { loadSamples, saveSamples } from '../../fetch/cache.js'
import type { RawCommit } from '../../models/commit.js'
import { sampleGroup } from '../select.js'

const BASE_DATE = '2025-12-31T00:00:00.000Z'

function makeCommit(sha: string, additions = 5, daysAgo = 0): RawCommit {
  const date = new Date(BASE_DATE)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return {
    sha,
    repo: 'u/r',
    message: `commit ${sha}`,
    author: 'u',
    authoredAt: date.toISOString(),
    additions,
    deletions: 0,
    files: [],
    languages: ['Python'],
  }
}

describe('sampleGroup', () => {
  it('returns all commits when group is smaller than n', () => {
    const commits = Array.from({ length: 5 }, (_, index) => makeCommit(`sha${index}`))
    expect(sampleGroup(commits, 20)).toHaveLength(5)
  })

  it('returns all commits when group equals n', () => {
    const commits = Array.from({ length: 20 }, (_, index) => makeCommit(`sha${index}`))
    expect(sampleGroup(commits, 20)).toHaveLength(20)
  })

  it('samples down large groups with recent and large commits', () => {
    const commits = Array.from({ length: 100 }, (_, index) =>
      makeCommit(`sha${String(index).padStart(3, '0')}`, index, index),
    )
    const result = sampleGroup(commits, 20)
    const shas = new Set(result.map((commit) => commit.sha))

    expect(result).toHaveLength(20)
    expect(shas.has('sha000')).toBe(true)
    expect(shas.has('sha099')).toBe(true)
  })

  it('is deterministic for the same input', () => {
    const commits = Array.from({ length: 100 }, (_, index) =>
      makeCommit(`sha${String(index).padStart(3, '0')}`, index, index),
    )
    const first = new Set(sampleGroup(commits, 20).map((commit) => commit.sha))
    const second = new Set(sampleGroup(commits, 20).map((commit) => commit.sha))
    expect(first).toEqual(second)
  })

  it('does not return duplicate commits', () => {
    const commits = Array.from({ length: 100 }, (_, index) =>
      makeCommit(`sha${String(index).padStart(3, '0')}`, index, index),
    )
    const result = sampleGroup(commits, 20)
    expect(result).toHaveLength(20)
    expect(new Set(result.map((commit) => commit.sha)).size).toBe(20)
  })
})

describe('shouldUseSampleCache', () => {
  it('hits cache only when there are no new commits', async () => {
    const { shouldUseSampleCache } = await import('../index.js')
    expect(shouldUseSampleCache(false, true, 0)).toBe(true)
    expect(shouldUseSampleCache(false, true, 3)).toBe(false)
    expect(shouldUseSampleCache(true, true, 0)).toBe(false)
  })
})

describe('sampleCommits', () => {
  it('can bypass cache reuse when the caller wants to resample', async () => {
    const { sampleCommits } = await import('../index.js')
    const commits = Array.from({ length: 30 }, (_, index) =>
      makeCommit(`sha${String(index).padStart(3, '0')}`, index, index),
    )
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-sample-cache-'))
    saveSamples(join(cacheDir, 'u__r', 'samples.json'), [
      {
        repo: 'u/r',
        language: 'Python',
        totalInGroup: 30,
        commits: commits.slice(0, 20),
      },
    ])
    const config = defaultConfig({
      repos: ['u/r'],
      author: 'u',
      samplesPerGroup: 5,
      cacheDir,
      fresh: false,
    })

    const result = sampleCommits(commits, config, {
      slug: 'u__r',
      newCommitCount: 0,
      preferCache: false,
    })

    expect(result.fromCache).toBe(false)
    expect(result.clusters[0]?.commits).toHaveLength(5)
  })

  it('overwrites stale sample cache with an empty result', async () => {
    const { sampleCommits } = await import('../index.js')
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-sample-empty-'))
    const samplesPath = join(cacheDir, 'u__r', 'samples.json')
    saveSamples(samplesPath, [
      {
        repo: 'u/r',
        language: 'Python',
        totalInGroup: 1,
        commits: [makeCommit('sha001')],
      },
    ])
    const config = defaultConfig({
      repos: ['u/r'],
      author: 'u',
      samplesPerGroup: 5,
      cacheDir,
      fresh: false,
    })

    const result = sampleCommits([], config, {
      slug: 'u__r',
      newCommitCount: 1,
      preferCache: false,
    })

    expect(result.fromCache).toBe(false)
    expect(result.clusters).toEqual([])
    expect(existsSync(samplesPath)).toBe(true)
    expect(loadSamples(samplesPath)).toEqual([])
  })
})

describe('buildClusters', () => {
  it('duplicates commits across repo languages', async () => {
    const { buildClusters } = await import('../index.js')
    const commit: RawCommit = {
      ...makeCommit('abc'),
      languages: ['Ruby', 'TypeScript'],
    }
    const clusters = buildClusters([commit], 20)
    expect(clusters).toHaveLength(2)
    expect(clusters.map((cluster) => cluster.language).sort()).toEqual(['Ruby', 'TypeScript'])
  })
})

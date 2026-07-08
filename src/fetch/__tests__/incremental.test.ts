import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { defaultConfig } from '../../config.js'
import { sampleCommits, shouldUseSampleCache } from '../../sample/index.js'
import {
  cleanupTempDirs,
  commitFile,
  createTempGitRepo,
  trackTempDir,
} from '../../test-helpers/git-repo.js'
import { assertCacheAuthor, loadCommits, loadMeta, saveMeta } from '../cache.js'
import { fetch } from '../index.js'

afterEach(() => {
  cleanupTempDirs()
})

function createRepo(author: string): string {
  const dir = createTempGitRepo('stylect-incremental-', author)
  commitFile(dir, author, 'one.rb', "puts 'one'\n", 'first commit')
  return dir
}

describe('incremental fetch', () => {
  it('appends only new commits on the second run', async () => {
    const repoPath = createRepo('dev-user')
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-cache-'))
    trackTempDir(cacheDir)

    const config = defaultConfig({
      author: 'dev-user',
      repos: ['owner/repo'],
      repoPaths: [repoPath],
      cacheDir,
      source: 'local',
    })

    const first = await fetch('owner/repo', { ...config, fresh: true })
    expect(first.allCommits).toHaveLength(1)

    commitFile(repoPath, 'dev-user', 'two.rb', `content ${Date.now()}\n`, 'second commit')

    const second = await fetch('owner/repo', config)
    expect(second.isIncremental).toBe(true)
    expect(second.newCommits).toHaveLength(1)
    expect(second.allCommits).toHaveLength(2)

    const cached = loadCommits(join(cacheDir, 'owner__repo', 'commits.jsonl'))
    expect(cached).toHaveLength(2)
  })

  it('rejects author changes without --fresh', async () => {
    const repoPath = createRepo('dev-user')
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-cache-'))
    trackTempDir(cacheDir)

    const baseConfig = defaultConfig({
      repos: ['owner/repo'],
      repoPaths: [repoPath],
      cacheDir,
      source: 'local',
    })

    await fetch('owner/repo', { ...baseConfig, author: 'dev-user', fresh: true })

    await expect(fetch('owner/repo', { ...baseConfig, author: 'other-dev' })).rejects.toThrow(
      /Re-run with --fresh/,
    )
  })

  it('recalculates samples when new commits arrive', async () => {
    expect(shouldUseSampleCache(false, true, 1)).toBe(false)
    expect(shouldUseSampleCache(false, true, 0)).toBe(true)

    const repoPath = createRepo('dev-user')
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-sample-cache-'))
    trackTempDir(cacheDir)

    const config = defaultConfig({
      author: 'dev-user',
      repos: ['owner/repo'],
      repoPaths: [repoPath],
      cacheDir,
      source: 'local',
      samplesPerGroup: 5,
    })

    const firstFetch = await fetch('owner/repo', { ...config, fresh: true })
    const firstSamples = sampleCommits(firstFetch.allCommits, config, {
      slug: 'owner__repo',
      newCommitCount: firstFetch.newCommits.length,
    })
    const samplesPath = join(cacheDir, 'owner__repo', 'samples.json')
    expect(existsSync(samplesPath)).toBe(true)
    expect(firstSamples.fromCache).toBe(false)

    commitFile(repoPath, 'dev-user', 'two.rb', `content ${Date.now()}\n`, 'second commit')
    const secondFetch = await fetch('owner/repo', config)
    const secondSamples = sampleCommits(secondFetch.allCommits, config, {
      slug: 'owner__repo',
      newCommitCount: secondFetch.newCommits.length,
    })

    expect(secondFetch.newCommits.length).toBeGreaterThan(0)
    expect(secondSamples.fromCache).toBe(false)
    expect(secondSamples.clusters.length).toBeGreaterThan(0)
    const persisted = JSON.parse(readFileSync(samplesPath, 'utf8')) as Array<{
      total_in_group: number
    }>
    expect(persisted[0]?.total_in_group).toBe(2)
    expect(firstSamples.clusters).not.toEqual(secondSamples.clusters)
  })
})

describe('cache meta', () => {
  it('loads meta and validates author', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-meta-'))
    trackTempDir(dir)
    const metaPath = join(dir, 'meta.json')
    saveMeta(metaPath, {
      last_fetch_at: '2024-01-01T00:00:00.000Z',
      source: 'local-git',
      author: 'dev-user',
      language_source: 'extensions',
    })

    expect(loadMeta(metaPath)?.author).toBe('dev-user')
    expect(() => assertCacheAuthor(loadMeta(metaPath), 'dev-user', 'owner/repo')).not.toThrow()
    expect(() => assertCacheAuthor(loadMeta(metaPath), 'other', 'owner/repo')).toThrow(
      /Re-run with --fresh/,
    )
  })
})

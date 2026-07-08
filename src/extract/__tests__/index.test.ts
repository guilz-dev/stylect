import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultConfig } from '../../config.js'
import { ensureParentDir } from '../../fetch/cache.js'
import { articlesPath, extractionsPath, loadExtractions, saveExtractions } from '../../llm/cache.js'
import type { SampledCluster } from '../../models/cluster.js'
import { extractClusters } from '../index.js'

vi.mock('../../llm/cursor.js', () => ({
  completeJson: vi.fn(),
}))

import { completeJson } from '../../llm/cursor.js'

const cluster: SampledCluster = {
  repo: 'owner/repo',
  language: 'TypeScript',
  totalInGroup: 1,
  commits: [
    {
      sha: 'abc123',
      repo: 'owner/repo',
      message: 'feat: init',
      author: 'dev',
      authoredAt: '2024-06-01T12:00:00Z',
      additions: 1,
      deletions: 0,
      languages: ['TypeScript'],
      files: [],
    },
  ],
}

afterEach(() => {
  vi.mocked(completeJson).mockReset()
})

describe('extractClusters', () => {
  it('loads cached extractions when cache is valid', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-extract-cache-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(cacheDir, slug)
    ensureParentDir(extractionsPath(repoCacheDir))
    saveExtractions(extractionsPath(repoCacheDir), [
      {
        repo: 'owner/repo',
        language: 'TypeScript',
        observations: [
          {
            dimension: 'patterns',
            claim: 'Uses interfaces',
            evidence: ['abc123'],
            confidence: 0.8,
          },
        ],
      },
    ])

    const config = defaultConfig({ cacheDir, repos: ['owner/repo'] })
    const result = await extractClusters([cluster], config, {
      slug,
      newCommitCount: 0,
      llm: { apiKey: 'key', model: 'composer-2.5' },
    })

    expect(result.fromCache).toBe(true)
    expect(result.extractions[0]?.observations[0]?.claim).toBe('Uses interfaces')
    expect(completeJson).not.toHaveBeenCalled()
  })

  it('invalidates compile cache before a fresh extract run', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-extract-invalidate-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(cacheDir, slug)
    ensureParentDir(articlesPath(repoCacheDir))
    writeFileSync(articlesPath(repoCacheDir), '[]\n')

    vi.mocked(completeJson).mockRejectedValue(new Error('LLM down'))

    const config = defaultConfig({ cacheDir, repos: ['owner/repo'] })
    await extractClusters([cluster], config, {
      slug,
      newCommitCount: 0,
      llm: { apiKey: 'key', model: 'composer-2.5' },
    })

    expect(existsSync(articlesPath(repoCacheDir))).toBe(false)
  })

  it('skips failed clusters and continues', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-extract-skip-'))
    const slug = 'owner__repo'

    vi.mocked(completeJson)
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce({
        observations: [
          {
            dimension: 'testing',
            claim: 'Uses vitest',
            evidence: ['abc123'],
            confidence: 0.9,
          },
        ],
      })

    const secondCluster: SampledCluster = {
      ...cluster,
      language: 'Ruby',
    }

    const config = defaultConfig({ cacheDir, repos: ['owner/repo'] })
    const result = await extractClusters([cluster, secondCluster], config, {
      slug,
      newCommitCount: 1,
      llm: { apiKey: 'key', model: 'composer-2.5' },
    })

    expect(result.skippedClusters).toBe(1)
    expect(result.extractions).toHaveLength(2)
    expect(result.extractions[1]?.observations[0]?.claim).toBe('Uses vitest')
    expect(existsSync(extractionsPath(join(cacheDir, slug)))).toBe(true)
  })

  it('returns cached extractions when new commits do not change sampled clusters', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-extract-stable-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(cacheDir, slug)
    ensureParentDir(extractionsPath(repoCacheDir))
    saveExtractions(extractionsPath(repoCacheDir), [
      {
        repo: 'owner/repo',
        language: 'TypeScript',
        observations: [
          {
            dimension: 'patterns',
            claim: 'Uses interfaces',
            evidence: ['abc123'],
            confidence: 0.8,
          },
        ],
      },
    ])

    const config = defaultConfig({ cacheDir, repos: ['owner/repo'] })
    const result = await extractClusters([cluster], config, {
      slug,
      newCommitCount: 1,
      llm: { apiKey: 'key', model: 'composer-2.5' },
      previousClusters: [cluster],
    })

    expect(result.fromCache).toBe(true)
    expect(result.deltaClusterCount).toBe(0)
    expect(completeJson).not.toHaveBeenCalled()
  })

  it('prunes removed cluster extractions without calling LLM when delta is empty', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-extract-prune-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(cacheDir, slug)
    ensureParentDir(extractionsPath(repoCacheDir))
    saveExtractions(extractionsPath(repoCacheDir), [
      {
        repo: 'owner/repo',
        language: 'TypeScript',
        observations: [
          {
            dimension: 'patterns',
            claim: 'Uses interfaces',
            evidence: ['abc123'],
            confidence: 0.8,
          },
        ],
      },
      {
        repo: 'owner/repo',
        language: 'Ruby',
        observations: [
          {
            dimension: 'testing',
            claim: 'Uses rspec',
            evidence: ['def456'],
            confidence: 0.8,
          },
        ],
      },
    ])

    const typescriptCluster = cluster
    const rubyCluster: SampledCluster = {
      ...cluster,
      language: 'Ruby',
      commits: [{ ...cluster.commits[0], sha: 'ruby-old' }],
    }
    const config = defaultConfig({ cacheDir, repos: ['owner/repo'] })
    const result = await extractClusters([typescriptCluster], config, {
      slug,
      newCommitCount: 1,
      llm: { apiKey: 'key', model: 'composer-2.5' },
      previousClusters: [typescriptCluster, rubyCluster],
    })

    expect(result.fromCache).toBe(false)
    expect(result.extractions).toHaveLength(1)
    expect(result.extractions[0]?.language).toBe('TypeScript')
    expect(completeJson).not.toHaveBeenCalled()
  })

  it('saves updated extractions when delta clusters are re-extracted', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-extract-delta-update-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(cacheDir, slug)
    ensureParentDir(extractionsPath(repoCacheDir))
    saveExtractions(extractionsPath(repoCacheDir), [
      {
        repo: 'owner/repo',
        language: 'TypeScript',
        observations: [
          {
            dimension: 'patterns',
            claim: 'Uses interfaces',
            evidence: ['abc123'],
            confidence: 0.8,
          },
        ],
      },
    ])

    const changedCluster: SampledCluster = {
      ...cluster,
      commits: [{ ...cluster.commits[0], sha: 'def456' }],
    }

    vi.mocked(completeJson).mockResolvedValue({
      observations: [
        {
          dimension: 'patterns',
          claim: 'Uses generics',
          evidence: ['def456'],
          confidence: 0.9,
        },
      ],
    })

    const config = defaultConfig({ cacheDir, repos: ['owner/repo'] })
    const result = await extractClusters([changedCluster], config, {
      slug,
      newCommitCount: 1,
      llm: { apiKey: 'key', model: 'composer-2.5' },
      previousClusters: [cluster],
    })

    expect(result.fromCache).toBe(false)
    expect(result.extractions[0]?.observations[0]?.claim).toBe('Uses generics')
    const cached = loadExtractions(extractionsPath(repoCacheDir))
    expect(cached[0]?.observations[0]?.claim).toBe('Uses generics')
    expect(completeJson).toHaveBeenCalledTimes(1)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultConfig } from '../../config.js'
import type { FetchResult, SampledCluster } from '../../models/cluster.js'
import { runPipeline } from '../run.js'

vi.mock('../../fetch/index.js', () => ({ fetch: vi.fn() }))
vi.mock('../../sample/index.js', () => ({ sampleCommits: vi.fn() }))
vi.mock('../../extract/index.js', () => ({ extractClusters: vi.fn() }))
vi.mock('../../compile/index.js', () => ({ compileWiki: vi.fn() }))
vi.mock('../../lint/index.js', () => ({ lintWiki: vi.fn() }))
vi.mock('../../llm/token.js', () => ({ resolveCursorApiKey: vi.fn() }))

import { compileWiki } from '../../compile/index.js'
import { extractClusters } from '../../extract/index.js'
import { fetch } from '../../fetch/index.js'
import { lintWiki } from '../../lint/index.js'
import { resolveCursorApiKey } from '../../llm/token.js'
import { sampleCommits } from '../../sample/index.js'

const cluster: SampledCluster = {
  repo: 'owner/repo',
  language: 'TypeScript',
  totalInGroup: 1,
  commits: [
    {
      sha: 'abc',
      repo: 'owner/repo',
      message: 'init',
      author: 'dev',
      authoredAt: '2024-01-01T00:00:00.000Z',
      additions: 1,
      deletions: 0,
      languages: ['TypeScript'],
      files: [],
    },
  ],
}

const fetchResult: FetchResult = {
  allCommits: cluster.commits,
  newCommits: cluster.commits,
  isIncremental: false,
  source: 'local-git',
  sourcePath: '/tmp/repo',
  languageSource: 'extensions',
}

beforeEach(() => {
  vi.mocked(fetch).mockResolvedValue(fetchResult)
  vi.mocked(sampleCommits).mockReturnValue({ clusters: [cluster], fromCache: false })
  vi.mocked(extractClusters).mockResolvedValue({
    extractions: [],
    fromCache: false,
    skippedClusters: 0,
  })
  vi.mocked(compileWiki).mockResolvedValue({ articles: [], fromCache: false, failedSlugs: [] })
  vi.mocked(lintWiki).mockResolvedValue({
    report: { passed: true, issues: [] },
    fromCache: false,
  })
  vi.mocked(resolveCursorApiKey).mockReturnValue('test-key')
})

afterEach(() => {
  vi.clearAllMocks()
  delete process.env.CURSOR_API_KEY
})

describe('runPipeline', () => {
  it('stops after sample when --skip-llm is set', async () => {
    const config = defaultConfig({
      author: 'dev',
      repos: ['owner/repo'],
      skipLlm: true,
    })

    const result = await runPipeline(config)

    expect(result.llmSkipped).toBe(true)
    expect(extractClusters).not.toHaveBeenCalled()
    expect(compileWiki).not.toHaveBeenCalled()
    expect(lintWiki).not.toHaveBeenCalled()
  })

  it('soft-stops after sample when CURSOR_API_KEY is missing and LLM is needed', async () => {
    vi.mocked(resolveCursorApiKey).mockReturnValue(undefined)

    const config = defaultConfig({
      author: 'dev',
      repos: ['owner/repo'],
    })

    const result = await runPipeline(config)

    expect(result.llmSkipped).toBe(true)
    expect(extractClusters).not.toHaveBeenCalled()
  })

  it('reports partial failure when extract skips clusters', async () => {
    vi.mocked(extractClusters).mockResolvedValue({
      extractions: [],
      fromCache: false,
      skippedClusters: 2,
    })

    const config = defaultConfig({
      author: 'dev',
      repos: ['owner/repo'],
      cursorApiKey: 'test-key',
    })

    const result = await runPipeline(config)

    expect(result.llmPartialFailure).toBe(true)
    expect(result.lintFailed).toBe(false)
  })

  it('reports lint failure', async () => {
    vi.mocked(lintWiki).mockResolvedValue({
      report: {
        passed: false,
        issues: [{ article: 'patterns', severity: 'error', message: 'contradiction' }],
      },
      fromCache: false,
    })

    const config = defaultConfig({
      author: 'dev',
      repos: ['owner/repo'],
      cursorApiKey: 'test-key',
    })

    const result = await runPipeline(config)

    expect(result.lintFailed).toBe(true)
  })

  it('throws when no clusters are sampled', async () => {
    vi.mocked(sampleCommits).mockReturnValue({ clusters: [], fromCache: false })

    const config = defaultConfig({
      author: 'dev',
      repos: ['owner/repo'],
    })

    await expect(runPipeline(config)).rejects.toThrow(/No sampled clusters/)
  })
})

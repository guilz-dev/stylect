import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultConfig } from '../../config.js'
import type { WikiArticle } from '../../models/article.js'
import type { FetchResult, SampledCluster } from '../../models/cluster.js'
import { runPipeline } from '../run.js'

vi.mock('../../fetch/index.js', () => ({ fetch: vi.fn() }))
vi.mock('../../sample/index.js', () => ({ sampleCommits: vi.fn() }))
vi.mock('../../extract/index.js', () => ({ extractClusters: vi.fn() }))
vi.mock('../../compile/index.js', () => ({ compileWiki: vi.fn() }))
vi.mock('../../lint/index.js', () => ({ lintWiki: vi.fn() }))
vi.mock('../../llm/token.js', () => ({ resolveCursorApiKey: vi.fn() }))
vi.mock('../../writer/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../writer/index.js')>()
  return {
    ...actual,
    writeArtifacts: vi.fn(),
  }
})
vi.mock('../up-to-date.js', () => ({
  outputArtifactsExist: vi.fn(),
}))

import { compileWiki } from '../../compile/index.js'
import { extractClusters } from '../../extract/index.js'
import { fetch } from '../../fetch/index.js'
import { lintWiki } from '../../lint/index.js'
import { resolveCursorApiKey } from '../../llm/token.js'
import { sampleCommits } from '../../sample/index.js'
import { writeArtifacts } from '../../writer/index.js'
import { outputArtifactsExist } from '../up-to-date.js'

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

const article: WikiArticle = {
  slug: 'patterns',
  title: 'Patterns',
  category: 'dimension',
  confidence: 0.8,
  sourceRepos: ['owner/repo'],
  content: 'Uses small modules.',
  wikilinks: [],
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
    deltaClusterCount: 1,
  })
  vi.mocked(compileWiki).mockResolvedValue({
    articles: [article],
    fromCache: false,
    failedSlugs: [],
  })
  vi.mocked(lintWiki).mockResolvedValue({
    report: { passed: true, issues: [] },
    fromCache: false,
  })
  vi.mocked(resolveCursorApiKey).mockReturnValue('test-key')
  vi.mocked(writeArtifacts).mockReturnValue({
    wikiDir: '/tmp/wiki',
    rulesDir: '/tmp/rules',
    wikiFiles: 3,
    rulesFiles: 1,
  })
  vi.mocked(outputArtifactsExist).mockReturnValue(false)
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
    expect(result.repoResults[0]?.status).toBe('skipped-llm')
    expect(extractClusters).not.toHaveBeenCalled()
    expect(writeArtifacts).not.toHaveBeenCalled()
  })

  it('soft-stops after sample when CURSOR_API_KEY is missing and LLM is needed', async () => {
    vi.mocked(resolveCursorApiKey).mockReturnValue(undefined)

    const config = defaultConfig({
      author: 'dev',
      repos: ['owner/repo'],
    })

    const result = await runPipeline(config)

    expect(result.llmSkipped).toBe(true)
    expect(result.repoResults[0]?.status).toBe('skipped-no-key')
    expect(extractClusters).not.toHaveBeenCalled()
    expect(writeArtifacts).not.toHaveBeenCalled()
  })

  it('writes artifacts after lint when LLM completes', async () => {
    const config = defaultConfig({
      author: 'dev',
      repos: ['owner/repo'],
      cursorApiKey: 'test-key',
    })

    const result = await runPipeline(config)

    expect(result.wroteArtifacts).toBe(true)
    expect(writeArtifacts).toHaveBeenCalled()
  })

  it('reports partial failure when extract skips clusters', async () => {
    vi.mocked(extractClusters).mockResolvedValue({
      extractions: [],
      fromCache: false,
      skippedClusters: 2,
      deltaClusterCount: 1,
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

  it('reports lint failure but still writes artifacts', async () => {
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
    expect(result.wroteArtifacts).toBe(true)
    expect(writeArtifacts).toHaveBeenCalled()
  })

  it('skips repo when no clusters are sampled', async () => {
    vi.mocked(sampleCommits).mockReturnValue({ clusters: [], fromCache: false })

    const config = defaultConfig({
      author: 'dev',
      repos: ['owner/repo'],
    })

    const result = await runPipeline(config)

    expect(result.repoResults[0]?.status).toBe('skipped-error')
    expect(result.wroteArtifacts).toBe(false)
    expect(result.llmPartialFailure).toBe(true)
  })

  it('writes artifacts from successful repos when a later repo fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(fetchResult)
      .mockResolvedValueOnce({
        ...fetchResult,
        allCommits: [],
        newCommits: [],
      })
    vi.mocked(sampleCommits)
      .mockReturnValueOnce({ clusters: [cluster], fromCache: false })
      .mockReturnValueOnce({ clusters: [], fromCache: false })

    const config = defaultConfig({
      author: 'dev',
      repos: ['owner/a', 'owner/b'],
      cursorApiKey: 'test-key',
    })

    const result = await runPipeline(config)

    expect(result.repoResults[0]?.status).toBe('complete')
    expect(result.repoResults[1]?.status).toBe('skipped-error')
    expect(result.wroteArtifacts).toBe(true)
    expect(writeArtifacts).toHaveBeenCalled()
  })

  it('clears stale output when completed repos produce zero articles', async () => {
    vi.mocked(compileWiki).mockResolvedValue({
      articles: [],
      fromCache: false,
      failedSlugs: [],
    })

    const config = defaultConfig({
      author: 'dev',
      repos: ['owner/repo'],
      cursorApiKey: 'test-key',
      outputDir: mkdtempSync(join(tmpdir(), 'stylect-run-empty-wiki-')),
      rulesDir: mkdtempSync(join(tmpdir(), 'stylect-run-empty-rules-')),
    })
    writeFileSync(join(config.outputDir, 'patterns.md'), '# stale\n')
    writeFileSync(join(config.outputDir, 'index.md'), '# stale index\n')
    writeFileSync(join(config.rulesDir, 'stylect-patterns.mdc'), '---\n---\n')

    const result = await runPipeline(config)

    expect(result.wroteArtifacts).toBe(true)
    expect(writeArtifacts).not.toHaveBeenCalled()
    expect(existsSync(join(config.outputDir, 'patterns.md'))).toBe(false)
    expect(existsSync(join(config.outputDir, 'index.md'))).toBe(false)
    expect(existsSync(join(config.rulesDir, 'stylect-patterns.mdc'))).toBe(false)
  })

  it('prints up to date and skips write when repos and output are current', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ...fetchResult,
      newCommits: [],
      isIncremental: true,
    })
    vi.mocked(extractClusters).mockResolvedValue({
      extractions: [],
      fromCache: true,
      skippedClusters: 0,
      deltaClusterCount: 0,
    })
    vi.mocked(compileWiki).mockResolvedValue({
      articles: [article],
      fromCache: true,
      failedSlugs: [],
    })
    vi.mocked(lintWiki).mockResolvedValue({
      report: { passed: true, issues: [] },
      fromCache: true,
    })
    vi.mocked(outputArtifactsExist).mockReturnValue(true)

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const config = defaultConfig({
      author: 'dev',
      repos: ['owner/repo'],
      cursorApiKey: 'test-key',
    })

    const result = await runPipeline(config)

    expect(result.wroteArtifacts).toBe(false)
    expect(writeArtifacts).not.toHaveBeenCalled()
    expect(stdout.mock.calls.map((call) => String(call[0])).join('')).toContain(
      'stylect: up to date',
    )

    stdout.mockRestore()
  })
})

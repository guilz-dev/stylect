import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultConfig } from '../../config.js'
import { ensureParentDir } from '../../fetch/cache.js'
import { articlesPath, lintPath, saveArticles, saveLint } from '../../llm/cache.js'
import type { WikiArticle } from '../../models/article.js'
import { lintWiki } from '../index.js'

vi.mock('../../llm/cursor.js', () => ({
  completeJson: vi.fn(),
}))

import { completeJson } from '../../llm/cursor.js'

const article: WikiArticle = {
  slug: 'patterns',
  title: 'Patterns',
  category: 'dimension',
  confidence: 0.8,
  sourceRepos: ['owner/repo'],
  content: 'Uses small modules.',
  wikilinks: [],
}

afterEach(() => {
  vi.mocked(completeJson).mockReset()
})

describe('lintWiki', () => {
  it('does not load lint cache when articles.json is missing', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-lint-guard-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(cacheDir, slug)
    ensureParentDir(lintPath(repoCacheDir))
    saveLint(lintPath(repoCacheDir), { passed: true, issues: [] })

    vi.mocked(completeJson).mockResolvedValue({ issues: [], passed: true })

    const config = defaultConfig({ cacheDir, repos: ['owner/repo'] })
    const result = await lintWiki([article], config, {
      slug,
      newCommitCount: 0,
      llm: { apiKey: 'key', model: 'composer-2.5' },
    })

    expect(result.fromCache).toBe(false)
    expect(completeJson).toHaveBeenCalled()
  })

  it('returns passed for empty articles without calling LLM', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-lint-empty-'))
    const config = defaultConfig({ cacheDir, repos: ['owner/repo'] })

    const result = await lintWiki([], config, {
      slug: 'owner__repo',
      newCommitCount: 0,
      llm: { apiKey: 'key', model: 'composer-2.5' },
    })

    expect(result.report.passed).toBe(true)
    expect(completeJson).not.toHaveBeenCalled()
  })

  it('loads lint from cache when articles also exist', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-lint-cache-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(cacheDir, slug)
    ensureParentDir(lintPath(repoCacheDir))
    saveArticles(articlesPath(repoCacheDir), [article])
    saveLint(lintPath(repoCacheDir), {
      passed: false,
      issues: [{ article: 'patterns', severity: 'warning', message: 'weak evidence' }],
    })

    const config = defaultConfig({ cacheDir, repos: ['owner/repo'] })
    const result = await lintWiki([article], config, {
      slug,
      newCommitCount: 0,
      llm: { apiKey: 'key', model: 'composer-2.5' },
    })

    expect(result.fromCache).toBe(true)
    expect(result.report.issues).toHaveLength(1)
    expect(completeJson).not.toHaveBeenCalled()
  })

  it('persists an error report when LLM fails', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-lint-fail-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(cacheDir, slug)

    vi.mocked(completeJson).mockRejectedValue(new Error('timeout'))

    const config = defaultConfig({ cacheDir, repos: ['owner/repo'] })
    const result = await lintWiki([article], config, {
      slug,
      newCommitCount: 1,
      llm: { apiKey: 'key', model: 'composer-2.5' },
    })

    expect(result.report.passed).toBe(false)
    expect(result.report.issues[0]?.message).toContain('Lint failed')
    expect(existsSync(lintPath(repoCacheDir))).toBe(true)
  })
})

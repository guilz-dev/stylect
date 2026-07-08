import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileWiki } from '../../compile/index.js'
import { defaultConfig } from '../../config.js'
import { ensureParentDir } from '../../fetch/cache.js'
import type { WikiArticle } from '../../models/article.js'
import type { ClusterExtraction } from '../../models/extraction.js'
import {
  needsCursorApiKey,
  repoNeedsLlm,
  resolveLlmStageNeeds,
} from '../../util/llm-requirements.js'
import {
  articlesPath,
  extractionsPath,
  invalidateAllLlmCache,
  invalidateCompileCache,
  lintPath,
  saveArticles,
  saveExtractions,
} from '../cache.js'

describe('resolveLlmStageNeeds', () => {
  it('returns all false when skipLlm is set', () => {
    const config = defaultConfig({ skipLlm: true })
    expect(resolveLlmStageNeeds(config, 'owner__repo', 0, false)).toEqual({
      extract: false,
      compile: false,
      lint: false,
    })
    expect(
      needsCursorApiKey(config, {
        slug: 'owner__repo',
        newCommitCount: 0,
        samplesRecalculated: false,
      }),
    ).toBe(false)
  })

  it('requires all stages when samples were recalculated', () => {
    const config = defaultConfig({ repos: ['owner/repo'] })
    expect(resolveLlmStageNeeds(config, 'owner__repo', 0, true)).toEqual({
      extract: true,
      compile: true,
      lint: true,
    })
  })
})

describe('compile cache guard', () => {
  it('does not load articles when extractions.json is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-compile-guard-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(dir, slug)
    ensureParentDir(articlesPath(repoCacheDir))

    const article: WikiArticle = {
      slug: 'patterns',
      title: 'Patterns',
      category: 'dimension',
      confidence: 0.8,
      sourceRepos: ['owner/repo'],
      content: 'Uses interfaces.',
      wikilinks: [],
    }
    saveArticles(articlesPath(repoCacheDir), [article])

    const config = defaultConfig({ cacheDir: dir, repos: ['owner/repo'] })
    const result = await compileWiki([], config, {
      slug,
      newCommitCount: 0,
      llm: { apiKey: 'test-key', model: 'composer-2.5' },
    })

    expect(result.fromCache).toBe(false)
    expect(result.articles).toEqual([])
  })
})

describe('llm cache invalidation', () => {
  it('invalidateAllLlmCache removes all LLM artifacts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-llm-cache-'))
    writeFileSync(extractionsPath(dir), '[]\n')
    writeFileSync(articlesPath(dir), '[]\n')
    writeFileSync(lintPath(dir), '{"issues":[],"passed":true}\n')

    invalidateAllLlmCache(dir)

    expect(existsSync(extractionsPath(dir))).toBe(false)
    expect(existsSync(articlesPath(dir))).toBe(false)
    expect(existsSync(lintPath(dir))).toBe(false)
  })

  it('saveExtractions invalidates downstream caches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-llm-save-'))
    writeFileSync(articlesPath(dir), '[]\n')
    writeFileSync(lintPath(dir), '{"issues":[],"passed":true}\n')

    const extraction: ClusterExtraction = {
      repo: 'owner/repo',
      language: 'Ruby',
      observations: [],
    }
    saveExtractions(extractionsPath(dir), [extraction])

    expect(existsSync(extractionsPath(dir))).toBe(true)
    expect(existsSync(articlesPath(dir))).toBe(false)
    expect(existsSync(lintPath(dir))).toBe(false)
  })

  it('invalidateCompileCache removes articles and lint only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-llm-partial-'))
    writeFileSync(extractionsPath(dir), '[]\n')
    writeFileSync(articlesPath(dir), '[]\n')
    writeFileSync(lintPath(dir), '{"issues":[],"passed":true}\n')

    invalidateCompileCache(dir)

    expect(existsSync(extractionsPath(dir))).toBe(true)
    expect(existsSync(articlesPath(dir))).toBe(false)
    expect(existsSync(lintPath(dir))).toBe(false)
  })
})

describe('needsCursorApiKey', () => {
  it('returns false when all LLM caches exist and inputs are stable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-llm-needs-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(dir, slug)
    ensureParentDir(extractionsPath(repoCacheDir))
    writeFileSync(extractionsPath(repoCacheDir), '[]\n')
    writeFileSync(articlesPath(repoCacheDir), '[]\n')
    writeFileSync(lintPath(repoCacheDir), '{"issues":[],"passed":true}\n')

    const config = defaultConfig({ cacheDir: dir, repos: ['owner/repo'] })
    expect(needsCursorApiKey(config, { slug, newCommitCount: 0, samplesRecalculated: false })).toBe(
      false,
    )
    expect(repoNeedsLlm(config, slug, 0, false)).toBe(false)
  })

  it('returns true when samples were recalculated', () => {
    const config = defaultConfig({ repos: ['owner/repo'] })
    expect(
      needsCursorApiKey(config, {
        slug: 'owner__repo',
        newCommitCount: 0,
        samplesRecalculated: true,
      }),
    ).toBe(true)
  })
})

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
  buildLlmCacheMeta,
  extractionsPath,
  invalidateAllLlmCache,
  invalidateCompileCache,
  isLlmCacheCompatible,
  lintPath,
  llmMetaPath,
  saveArticles,
  saveExtractions,
  saveLlmMeta,
} from '../cache.js'

describe('resolveLlmStageNeeds', () => {
  it('returns all false when skipLlm is set', () => {
    const config = defaultConfig({ skipLlm: true })
    expect(resolveLlmStageNeeds(config, 'owner__repo', 0, 0)).toEqual({
      extract: false,
      compile: false,
      lint: false,
    })
    expect(
      needsCursorApiKey(config, {
        slug: 'owner__repo',
        newCommitCount: 0,
        deltaClusterCount: 0,
      }),
    ).toBe(false)
  })

  it('requires all stages when delta clusters exist', () => {
    const config = defaultConfig({ repos: ['owner/repo'] })
    expect(resolveLlmStageNeeds(config, 'owner__repo', 2, 1)).toEqual({
      extract: true,
      compile: true,
      lint: true,
    })
  })

  it('uses cache when new commits exist but no cluster delta', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-llm-stable-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(dir, slug)
    ensureParentDir(extractionsPath(repoCacheDir))
    writeFileSync(extractionsPath(repoCacheDir), '[]\n')
    writeFileSync(articlesPath(repoCacheDir), '[]\n')
    writeFileSync(lintPath(repoCacheDir), '{"issues":[],"passed":true}\n')

    const config = defaultConfig({ cacheDir: dir, repos: ['owner/repo'] })
    expect(resolveLlmStageNeeds(config, slug, 1, 0)).toEqual({
      extract: false,
      compile: false,
      lint: false,
    })
    expect(needsCursorApiKey(config, { slug, newCommitCount: 1, deltaClusterCount: 0 })).toBe(false)
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
      llm: { provider: 'cursor', apiKey: 'test-key', model: 'composer-2.5' },
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
    expect(needsCursorApiKey(config, { slug, newCommitCount: 0, deltaClusterCount: 0 })).toBe(false)
    expect(repoNeedsLlm(config, slug, 0, 0)).toBe(false)
  })

  it('requires only missing stages when caches are partially present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-llm-partial-needs-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(dir, slug)
    ensureParentDir(extractionsPath(repoCacheDir))
    writeFileSync(extractionsPath(repoCacheDir), '[]\n')
    writeFileSync(articlesPath(repoCacheDir), '[]\n')

    const config = defaultConfig({ cacheDir: dir, repos: ['owner/repo'] })
    const needs = resolveLlmStageNeeds(config, slug, 0, 0)
    expect(needs).toEqual({ extract: false, compile: false, lint: true })
    expect(repoNeedsLlm(config, slug, 0, 0)).toBe(true)
    expect(needsCursorApiKey(config, { slug, newCommitCount: 0, deltaClusterCount: 0 })).toBe(true)
  })

  it('requires compile/lint when output language changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-llm-lang-switch-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(dir, slug)
    ensureParentDir(extractionsPath(repoCacheDir))
    writeFileSync(extractionsPath(repoCacheDir), '[]\n')
    writeFileSync(articlesPath(repoCacheDir), '[]\n')
    writeFileSync(lintPath(repoCacheDir), '{"issues":[],"passed":true}\n')
    saveLlmMeta(
      llmMetaPath(repoCacheDir),
      buildLlmCacheMeta({
        outputLanguage: 'en',
        llmProvider: 'cursor',
        model: 'composer-2.5',
      }),
    )

    const config = defaultConfig({
      cacheDir: dir,
      repos: ['owner/repo'],
      outputLanguage: 'ja',
    })

    const needs = resolveLlmStageNeeds(config, slug, 0, 0)
    expect(needs).toEqual({ extract: false, compile: true, lint: true })
    expect(needsCursorApiKey(config, { slug, newCommitCount: 0, deltaClusterCount: 0 })).toBe(true)
  })

  it('requires compile/lint when llm provider changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-llm-provider-switch-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(dir, slug)
    ensureParentDir(extractionsPath(repoCacheDir))
    writeFileSync(extractionsPath(repoCacheDir), '[]\n')
    writeFileSync(articlesPath(repoCacheDir), '[]\n')
    writeFileSync(lintPath(repoCacheDir), '{"issues":[],"passed":true}\n')
    saveLlmMeta(
      llmMetaPath(repoCacheDir),
      buildLlmCacheMeta({
        outputLanguage: 'en',
        llmProvider: 'cursor',
        model: 'composer-2.5',
      }),
    )

    const config = defaultConfig({
      cacheDir: dir,
      repos: ['owner/repo'],
      llmProvider: 'openai',
    })

    const needs = resolveLlmStageNeeds(config, slug, 0, 0)
    expect(needs).toEqual({ extract: false, compile: true, lint: true })
    expect(needsCursorApiKey(config, { slug, newCommitCount: 0, deltaClusterCount: 0 })).toBe(true)
  })

  it('treats legacy llm-meta without provider as cursor-compatible', () => {
    expect(
      isLlmCacheCompatible(
        { output_language: 'en' },
        {
          outputLanguage: 'en',
          llmProvider: 'cursor',
          model: 'composer-2.5',
        },
      ),
    ).toBe(true)
    expect(
      isLlmCacheCompatible(
        { output_language: 'en' },
        {
          outputLanguage: 'en',
          llmProvider: 'openai',
          model: 'gpt-4.1-mini',
        },
      ),
    ).toBe(false)
  })

  it('returns true when delta clusters need LLM work', () => {
    const config = defaultConfig({ repos: ['owner/repo'] })
    expect(
      needsCursorApiKey(config, { slug: 'owner__repo', newCommitCount: 1, deltaClusterCount: 1 }),
    ).toBe(true)
  })
})

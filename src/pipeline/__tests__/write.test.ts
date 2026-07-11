import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { defaultConfig } from '../../config.js'
import { ensureParentDir } from '../../fetch/cache.js'
import { articlesPath, lintPath, saveArticles, saveLint } from '../../llm/cache.js'
import { loadCachedRepoResult, runWritePipeline } from '../write.js'

const article = {
  slug: 'patterns',
  title: 'Patterns',
  category: 'dimension' as const,
  confidence: 0.8,
  sourceRepos: ['owner/repo'],
  content: 'Uses small modules.',
  wikilinks: [],
}

describe('loadCachedRepoResult', () => {
  it('loads articles and lint from repo cache', () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-write-load-'))
    const repoCacheDir = join(cacheDir, 'owner__repo')
    ensureParentDir(articlesPath(repoCacheDir))
    saveArticles(articlesPath(repoCacheDir), [article])
    saveLint(lintPath(repoCacheDir), {
      passed: false,
      issues: [{ article: 'patterns', severity: 'warning', message: 'weak evidence' }],
    })

    const result = loadCachedRepoResult('owner/repo', cacheDir)

    expect(result.status).toBe('complete')
    expect(result.articles).toHaveLength(1)
    expect(result.lint.passed).toBe(false)
  })

  it('throws when articles cache is missing', () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-write-missing-'))
    expect(() => loadCachedRepoResult('owner/repo', cacheDir)).toThrow(/No cached articles/)
  })
})

describe('runWritePipeline', () => {
  it('writes wiki and rules from cached artifacts', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-write-run-'))
    const wikiDir = mkdtempSync(join(tmpdir(), 'stylect-write-wiki-'))
    const rulesDir = mkdtempSync(join(tmpdir(), 'stylect-write-rules-'))
    const repoCacheDir = join(cacheDir, 'owner__repo')
    ensureParentDir(articlesPath(repoCacheDir))
    saveArticles(articlesPath(repoCacheDir), [article])
    saveLint(lintPath(repoCacheDir), { passed: true, issues: [] })

    const config = defaultConfig({
      repos: ['owner/repo'],
      cacheDir,
      outputDir: wikiDir,
      rulesDir,
    })

    const result = await runWritePipeline(config)

    expect(result.wroteArtifacts).toBe(true)
    expect(result.lintFailed).toBe(false)
    expect(existsSync(join(wikiDir, 'patterns.md'))).toBe(true)
    expect(existsSync(join(wikiDir, 'index.md'))).toBe(true)
    expect(existsSync(join(wikiDir, '_meta', 'lint.md'))).toBe(true)
    expect(existsSync(join(rulesDir, 'stylect-patterns.mdc'))).toBe(true)
    expect(readFileSync(join(wikiDir, 'patterns.md'), 'utf8')).toContain('Uses small modules.')
  })

  it('reports partial failure when a repo cache is missing', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-write-partial-'))
    const wikiDir = mkdtempSync(join(tmpdir(), 'stylect-write-partial-wiki-'))
    const rulesDir = mkdtempSync(join(tmpdir(), 'stylect-write-partial-rules-'))
    const repoCacheDir = join(cacheDir, 'owner__a')
    ensureParentDir(articlesPath(repoCacheDir))
    saveArticles(articlesPath(repoCacheDir), [article])

    const config = defaultConfig({
      repos: ['owner/a', 'owner/b'],
      cacheDir,
      outputDir: wikiDir,
      rulesDir,
    })

    const result = await runWritePipeline(config)

    expect(result.llmPartialFailure).toBe(true)
    expect(result.wroteArtifacts).toBe(true)
    expect(result.repoResults[0]?.status).toBe('complete')
    expect(result.repoResults[1]?.status).toBe('skipped-error')
  })
})

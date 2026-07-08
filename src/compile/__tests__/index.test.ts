import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { defaultConfig } from '../../config.js'
import { ensureParentDir } from '../../fetch/cache.js'
import { articlesPath, loadArticles, saveArticles } from '../../llm/cache.js'
import type { ClusterExtraction } from '../../models/extraction.js'
import { compileWiki } from '../index.js'

const extractions: ClusterExtraction[] = [
  {
    repo: 'owner/repo',
    language: 'TypeScript',
    observations: [
      {
        dimension: 'patterns',
        claim: 'Uses small modules',
        evidence: ['abc123'],
        confidence: 0.8,
      },
    ],
  },
]

describe('compileWiki', () => {
  it('drops stale language articles when clusters are pruned without delta compile', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-compile-prune-'))
    const slug = 'owner__repo'
    const repoCacheDir = join(cacheDir, slug)
    const cachePath = articlesPath(repoCacheDir)
    ensureParentDir(cachePath)
    saveArticles(cachePath, [
      {
        slug: 'patterns',
        title: 'Patterns',
        category: 'dimension',
        confidence: 0.8,
        sourceRepos: ['owner/repo'],
        content: 'Uses small modules.',
        wikilinks: [],
      },
      {
        slug: 'ruby',
        title: 'Ruby',
        category: 'language',
        confidence: 0.7,
        sourceRepos: ['owner/repo'],
        content: 'Idiomatic Ruby.',
        wikilinks: [],
      },
    ])

    const config = defaultConfig({ cacheDir, repos: ['owner/repo'] })
    const result = await compileWiki(extractions, config, {
      slug,
      newCommitCount: 1,
      llm: { apiKey: 'unused', model: 'composer-2.5' },
      deltaExtractions: [],
    })

    expect(result.fromCache).toBe(false)
    expect(result.articles.map((article) => article.slug)).toEqual(['patterns'])
    expect(existsSync(cachePath)).toBe(true)
    expect(loadArticles(cachePath).map((article) => article.slug)).toEqual(['patterns'])
  })
})

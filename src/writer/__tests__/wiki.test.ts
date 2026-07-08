import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { defaultConfig } from '../../config.js'
import type { WikiArticle } from '../../models/article.js'
import type { RepoLlmResult } from '../../pipeline/types.js'
import { mergeRepoArtifacts } from '../merge.js'
import { writeWiki } from '../wiki.js'

const articleA: WikiArticle = {
  slug: 'patterns',
  title: 'Patterns',
  category: 'dimension',
  confidence: 0.8,
  sourceRepos: ['owner/a'],
  content: 'Uses small modules.',
  wikilinks: ['testing'],
}

const articleB: WikiArticle = {
  slug: 'patterns',
  title: 'Patterns (updated)',
  category: 'dimension',
  confidence: 0.9,
  sourceRepos: ['owner/b'],
  content: 'Prefers composition.',
  wikilinks: [],
}

const languageArticle: WikiArticle = {
  slug: 'ruby',
  title: 'Ruby',
  category: 'language',
  confidence: 0.7,
  sourceRepos: ['owner/a'],
  content: 'Idiomatic Ruby style.',
  wikilinks: [],
}

function repoResult(repo: string, articles: WikiArticle[]): RepoLlmResult {
  return {
    repo,
    status: 'complete',
    articles,
    lint: { passed: true, issues: [] },
    newCommitCount: 0,
    upToDate: false,
  }
}

describe('mergeRepoArtifacts', () => {
  it('later repo wins for duplicate slugs', () => {
    const merged = mergeRepoArtifacts([
      repoResult('owner/a', [articleA]),
      repoResult('owner/b', [articleB]),
    ])

    expect(merged.articles).toHaveLength(1)
    expect(merged.articles[0]?.title).toBe('Patterns (updated)')
    expect(merged.articles[0]?.sourceRepos).toEqual(['owner/a', 'owner/b'])
    expect(merged.mergeLog).toContain('patterns: owner/a → owner/b')
  })

  it('keeps lint issues only from the repo that won each slug', () => {
    const merged = mergeRepoArtifacts([
      {
        repo: 'owner/a',
        status: 'complete',
        articles: [articleA],
        lint: {
          passed: false,
          issues: [{ article: 'patterns', severity: 'warning', message: 'weak evidence' }],
        },
        newCommitCount: 1,
        upToDate: false,
      },
      {
        repo: 'owner/b',
        status: 'complete',
        articles: [articleB],
        lint: {
          passed: true,
          issues: [{ article: 'patterns', severity: 'info', message: 'winner issue' }],
        },
        newCommitCount: 1,
        upToDate: false,
      },
    ])

    expect(merged.lint.issues).toHaveLength(1)
    expect(merged.lint.issues[0]?.message).toBe('winner issue')
    expect(merged.lint.passed).toBe(false)
  })

  it('keeps lint issues for slugs without collisions', () => {
    const testingArticle: WikiArticle = {
      slug: 'testing',
      title: 'Testing',
      category: 'dimension',
      confidence: 0.7,
      sourceRepos: ['owner/b'],
      content: 'Tests.',
      wikilinks: [],
    }
    const merged = mergeRepoArtifacts([
      {
        repo: 'owner/a',
        status: 'complete',
        articles: [articleA],
        lint: {
          passed: false,
          issues: [{ article: 'patterns', severity: 'warning', message: 'weak evidence' }],
        },
        newCommitCount: 1,
        upToDate: false,
      },
      {
        repo: 'owner/b',
        status: 'complete',
        articles: [testingArticle],
        lint: {
          passed: true,
          issues: [{ article: 'testing', severity: 'info', message: 'note' }],
        },
        newCommitCount: 1,
        upToDate: false,
      },
    ])

    expect(merged.lint.issues).toHaveLength(2)
  })
})

describe('writeWiki', () => {
  it('writes dimension, language, index, and meta files', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'stylect-wiki-'))
    const merged = mergeRepoArtifacts([repoResult('owner/a', [articleA, languageArticle])])
    const config = defaultConfig({ outputDir, author: 'dev' })

    const result = writeWiki(merged, config)

    expect(result.fileCount).toBeGreaterThan(0)
    expect(existsSync(join(outputDir, 'patterns.md'))).toBe(true)
    expect(existsSync(join(outputDir, 'languages', 'ruby.md'))).toBe(true)
    expect(existsSync(join(outputDir, 'index.md'))).toBe(true)
    expect(existsSync(join(outputDir, '_meta', 'generation-log.md'))).toBe(true)

    const log = readFileSync(join(outputDir, '_meta', 'generation-log.md'), 'utf8')
    expect(log).toContain('owner/a')
    expect(readFileSync(join(outputDir, 'index.md'), 'utf8')).toContain('[[patterns|Patterns]]')
  })

  it('normalizes language wikilinks in wiki output', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'stylect-wiki-links-'))
    const linkedDimension: WikiArticle = {
      ...articleA,
      content: 'See [[ruby]] for idioms.',
    }
    const merged = mergeRepoArtifacts([repoResult('owner/a', [linkedDimension, languageArticle])])
    const config = defaultConfig({ outputDir, author: 'dev' })

    writeWiki(merged, config)

    const patterns = readFileSync(join(outputDir, 'patterns.md'), 'utf8')
    expect(patterns).toContain('[[languages/ruby]]')
  })
})

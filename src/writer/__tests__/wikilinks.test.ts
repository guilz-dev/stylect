import { describe, expect, it } from 'vitest'

import type { WikiArticle } from '../../models/article.js'
import { convertWikilinksToMarkdown, normalizeWikiWikilinks } from '../wikilinks.js'

const dimension: WikiArticle = {
  slug: 'patterns',
  title: 'Patterns',
  category: 'dimension',
  confidence: 0.8,
  sourceRepos: ['owner/repo'],
  content: 'See [[ruby]] and [[testing]].',
  wikilinks: ['ruby', 'testing'],
}

const language: WikiArticle = {
  slug: 'ruby',
  title: 'Ruby',
  category: 'language',
  confidence: 0.7,
  sourceRepos: ['owner/repo'],
  content: 'Idiomatic Ruby.',
  wikilinks: [],
}

const testing: WikiArticle = {
  slug: 'testing',
  title: 'Testing',
  category: 'dimension',
  confidence: 0.7,
  sourceRepos: ['owner/repo'],
  content: 'Tests.',
  wikilinks: [],
}

const articles = [dimension, language, testing]

describe('normalizeWikiWikilinks', () => {
  it('rewrites language slugs to languages/ paths', () => {
    const normalized = normalizeWikiWikilinks('See [[ruby]] for idioms.', articles)
    expect(normalized).toBe('See [[languages/ruby]] for idioms.')
  })

  it('leaves dimension slugs unchanged', () => {
    const normalized = normalizeWikiWikilinks('See [[testing]].', articles)
    expect(normalized).toBe('See [[testing]].')
  })
})

describe('convertWikilinksToMarkdown', () => {
  it('links language articles under languages/', () => {
    const converted = convertWikilinksToMarkdown('See [[ruby]] for idioms.', articles)
    expect(converted).toBe('See [Ruby](languages/ruby.md) for idioms.')
  })

  it('links dimension articles at the wiki root', () => {
    const converted = convertWikilinksToMarkdown('See [[testing]].', articles)
    expect(converted).toBe('See [Testing](testing.md).')
  })
})

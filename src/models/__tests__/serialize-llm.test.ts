import { describe, expect, it } from 'vitest'

import {
  deserializeClusterExtraction,
  deserializeLintReport,
  deserializeWikiArticle,
  serializeClusterExtraction,
  serializeLintReport,
  serializeWikiArticle,
} from '../serialize-llm.js'

describe('serialize-llm round-trip', () => {
  it('round-trips cluster extraction', () => {
    const ext = {
      repo: 'owner/repo',
      language: 'Ruby',
      observations: [
        {
          dimension: 'testing' as const,
          claim: 'Uses RSpec',
          evidence: ['abc'],
          confidence: 0.85,
          language: 'Ruby',
        },
      ],
    }
    const serialized = serializeClusterExtraction(ext)
    expect(serialized.observations[0]?.dimension).toBe('testing')
    expect(deserializeClusterExtraction(serialized)).toEqual(ext)
  })

  it('round-trips wiki article', () => {
    const article = {
      slug: 'naming-conventions',
      title: 'Naming',
      category: 'dimension' as const,
      confidence: 0.7,
      sourceRepos: ['owner/repo'],
      content: 'Uses snake_case.',
      wikilinks: ['patterns'],
    }
    const serialized = serializeWikiArticle(article)
    expect(serialized.source_repos).toEqual(['owner/repo'])
    expect(deserializeWikiArticle(serialized)).toEqual(article)
  })

  it('round-trips lint report', () => {
    const report = {
      passed: false,
      issues: [
        {
          article: 'patterns',
          severity: 'warning' as const,
          message: 'Weak evidence',
          suggestion: 'Add more commits',
        },
      ],
    }
    const serialized = serializeLintReport(report)
    expect(deserializeLintReport(serialized)).toEqual(report)
  })

  it('drops observations with invalid dimensions', () => {
    const deserialized = deserializeClusterExtraction({
      repo: 'r',
      language: 'x',
      observations: [{ dimension: 'invalid', claim: 'x', evidence: [], confidence: 0.5 }],
    })
    expect(deserialized.observations).toHaveLength(0)
  })
})

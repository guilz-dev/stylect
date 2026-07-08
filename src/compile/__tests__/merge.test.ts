import { describe, expect, it } from 'vitest'
import type { ClusterExtraction } from '../../models/extraction.js'
import { fixWikilinks, groupObservations, slugifyLanguage, validCompileSlugs } from '../merge.js'

describe('groupObservations', () => {
  it('groups by dimension and language idioms', () => {
    const extractions: ClusterExtraction[] = [
      {
        repo: 'owner/repo',
        language: 'TypeScript',
        observations: [
          {
            dimension: 'naming-conventions',
            claim: 'Uses camelCase',
            evidence: ['sha1'],
            confidence: 0.8,
          },
          {
            dimension: 'language-idioms',
            claim: 'Prefers async/await',
            evidence: ['sha2'],
            confidence: 0.9,
            language: 'typescript',
          },
        ],
      },
    ]

    const grouped = groupObservations(extractions)
    expect(grouped.byDimension.get('naming-conventions')).toHaveLength(1)
    expect(grouped.byLanguage.get('TypeScript')).toHaveLength(1)
    expect(grouped.repos.has('owner/repo')).toBe(true)
  })
})

describe('slugifyLanguage', () => {
  it('normalizes special characters', () => {
    expect(slugifyLanguage('C++')).toBe('cplusplus')
    expect(slugifyLanguage('C#')).toBe('csharp')
  })
})

describe('validCompileSlugs', () => {
  it('returns dimension and language slugs with observations', () => {
    const grouped = groupObservations([
      {
        repo: 'r',
        language: 'Go',
        observations: [
          {
            dimension: 'patterns',
            claim: 'Uses interfaces',
            evidence: [],
            confidence: 0.6,
          },
          {
            dimension: 'language-idioms',
            claim: 'Idiomatic Go',
            evidence: [],
            confidence: 0.7,
            language: 'Go',
          },
        ],
      },
    ])
    const slugs = validCompileSlugs(grouped.byDimension, grouped.byLanguage)
    expect(slugs).toContain('patterns')
    expect(slugs).toContain('go')
  })
})

describe('fixWikilinks', () => {
  it('removes self-references and broken links', () => {
    const fixed = fixWikilinks([
      {
        slug: 'patterns',
        wikilinks: ['patterns', 'missing-slug', 'testing'],
        content: 'See [[patterns]] and [[missing-slug|Missing]] and [[testing]].',
      },
      {
        slug: 'testing',
        wikilinks: ['patterns'],
        content: 'Uses [[testing|Tests]].',
      },
    ])

    expect(fixed[0]?.wikilinks).toEqual(['testing'])
    expect(fixed[0]?.content).toContain('See patterns and Missing and [[testing]]')
    expect(fixed[1]?.content).toBe('Uses Tests.')
  })
})

import { describe, expect, it } from 'vitest'
import type { SampledCluster } from '../../models/cluster.js'
import type { ClusterExtraction } from '../../models/extraction.js'
import { alignExtractionsToClusters, extractionsDiffer, mergeExtractions } from '../merge.js'

const cluster = (language: string): SampledCluster => ({
  repo: 'owner/repo',
  language,
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
      languages: [language],
      files: [],
    },
  ],
})

describe('mergeExtractions', () => {
  it('replaces matching repo/language keys with newer extractions', () => {
    const previous: ClusterExtraction[] = [
      {
        repo: 'owner/repo',
        language: 'TypeScript',
        observations: [{ dimension: 'patterns', claim: 'old', evidence: ['a'], confidence: 0.5 }],
      },
    ]
    const updated: ClusterExtraction[] = [
      {
        repo: 'owner/repo',
        language: 'TypeScript',
        observations: [{ dimension: 'patterns', claim: 'new', evidence: ['b'], confidence: 0.8 }],
      },
      {
        repo: 'owner/repo',
        language: 'Ruby',
        observations: [
          { dimension: 'testing', claim: 'uses rspec', evidence: ['c'], confidence: 0.7 },
        ],
      },
    ]

    const merged = mergeExtractions(previous, updated)
    expect(merged).toHaveLength(2)
    const typescript = merged.find((entry) => entry.language === 'TypeScript')
    const ruby = merged.find((entry) => entry.language === 'Ruby')
    expect(typescript?.observations[0]?.claim).toBe('new')
    expect(ruby?.language).toBe('Ruby')
  })
})

describe('alignExtractionsToClusters', () => {
  it('drops extractions for clusters no longer present in samples', () => {
    const extractions: ClusterExtraction[] = [
      {
        repo: 'owner/repo',
        language: 'TypeScript',
        observations: [{ dimension: 'patterns', claim: 'ts', evidence: ['a'], confidence: 0.8 }],
      },
      {
        repo: 'owner/repo',
        language: 'Ruby',
        observations: [{ dimension: 'testing', claim: 'ruby', evidence: ['b'], confidence: 0.7 }],
      },
    ]

    const aligned = alignExtractionsToClusters(extractions, [cluster('TypeScript')])
    expect(aligned).toHaveLength(1)
    expect(aligned[0]?.language).toBe('TypeScript')
    expect(extractionsDiffer(extractions, aligned)).toBe(true)
  })
})

describe('extractionsDiffer', () => {
  it('returns true when observations change for the same repo/language key', () => {
    const before: ClusterExtraction[] = [
      {
        repo: 'owner/repo',
        language: 'TypeScript',
        observations: [{ dimension: 'patterns', claim: 'old', evidence: ['a'], confidence: 0.5 }],
      },
    ]
    const after: ClusterExtraction[] = [
      {
        repo: 'owner/repo',
        language: 'TypeScript',
        observations: [{ dimension: 'patterns', claim: 'new', evidence: ['b'], confidence: 0.8 }],
      },
    ]

    expect(extractionsDiffer(before, after)).toBe(true)
  })

  it('returns false when keys and observations are unchanged', () => {
    const extractions: ClusterExtraction[] = [
      {
        repo: 'owner/repo',
        language: 'TypeScript',
        observations: [{ dimension: 'patterns', claim: 'same', evidence: ['a'], confidence: 0.5 }],
      },
    ]

    expect(extractionsDiffer(extractions, extractions)).toBe(false)
  })
})

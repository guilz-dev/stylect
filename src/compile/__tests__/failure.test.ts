import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../llm/cursor.js', () => ({
  completeJson: vi.fn(),
}))

import { defaultConfig } from '../../config.js'
import { completeJson } from '../../llm/cursor.js'
import type { ClusterExtraction } from '../../models/extraction.js'
import { compileWiki } from '../index.js'

const extractions: ClusterExtraction[] = [
  {
    repo: 'owner/repo',
    language: 'TypeScript',
    observations: [
      {
        dimension: 'language-idioms',
        claim: 'Uses discriminated unions',
        evidence: ['abc123'],
        confidence: 0.8,
        language: 'TypeScript',
      },
    ],
  },
]

afterEach(() => {
  vi.clearAllMocks()
})

describe('compileWiki failure handling', () => {
  it('tracks failed language articles when language compilation throws', async () => {
    vi.mocked(completeJson)
      .mockResolvedValueOnce({
        title: 'Language Idioms',
        content: 'Prefer discriminated unions.',
        confidence: 0.8,
        wikilinks: [],
      })
      .mockRejectedValueOnce(new Error('rate limit'))

    const config = defaultConfig({
      repos: ['owner/repo'],
      cacheDir: mkdtempSync(join(tmpdir(), 'stylect-compile-failure-')),
      llmApiKey: 'test-key',
    })

    const result = await compileWiki(extractions, config, {
      slug: 'owner__repo',
      newCommitCount: 1,
      llm: { provider: 'cursor', apiKey: 'unused', model: 'composer-2.5' },
    })

    expect(result.failedSlugs).toEqual(['typescript'])
    expect(result.articles.map((article) => article.slug)).toEqual(['language-idioms'])
  })
})

import { describe, expect, it } from 'vitest'

import { defaultConfig } from '../../config.js'
import type { RepoLlmResult } from '../../pipeline/types.js'
import { shouldCleanupEmptyOutput, shouldWrite } from '../index.js'

function complete(repo: string, articleCount: number): RepoLlmResult {
  return {
    repo,
    status: 'complete',
    articles: Array.from({ length: articleCount }, (_, index) => ({
      slug: `article-${index}`,
      title: `Article ${index}`,
      category: 'dimension' as const,
      confidence: 0.8,
      sourceRepos: [repo],
      content: 'content',
      wikilinks: [],
    })),
    lint: { passed: true, issues: [] },
    newCommitCount: 0,
    upToDate: false,
  }
}

describe('shouldWrite', () => {
  it('returns false in plan mode', () => {
    const config = defaultConfig({ plan: true })
    expect(shouldWrite(config, [complete('owner/repo', 1)])).toBe(false)
  })

  it('returns false when --skip-llm', () => {
    const config = defaultConfig({ skipLlm: true })
    expect(shouldWrite(config, [complete('owner/repo', 1)])).toBe(false)
  })

  it('returns false when no repo completed LLM', () => {
    const config = defaultConfig()
    expect(
      shouldWrite(config, [
        {
          repo: 'owner/repo',
          status: 'skipped-no-key',
          articles: [],
          lint: { passed: true, issues: [] },
          newCommitCount: 0,
          upToDate: false,
        },
      ]),
    ).toBe(false)
  })

  it('returns false when articles are empty', () => {
    const config = defaultConfig()
    expect(shouldWrite(config, [complete('owner/repo', 0)])).toBe(false)
  })

  it('returns true when at least one article exists', () => {
    const config = defaultConfig()
    expect(shouldWrite(config, [complete('owner/repo', 2)])).toBe(true)
  })
})

describe('shouldCleanupEmptyOutput', () => {
  it('returns true when repos completed with zero articles', () => {
    const config = defaultConfig()
    expect(shouldCleanupEmptyOutput(config, [complete('owner/repo', 0)])).toBe(true)
  })

  it('returns false when articles exist', () => {
    const config = defaultConfig()
    expect(shouldCleanupEmptyOutput(config, [complete('owner/repo', 1)])).toBe(false)
  })
})

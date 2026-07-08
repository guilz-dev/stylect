import { describe, expect, it } from 'vitest'

import type { WikiArticle } from '../../models/article.js'
import { collectStaticLintIssues } from '../static.js'

function article(slug: string, content: string): WikiArticle {
  return {
    slug,
    title: slug,
    category: 'dimension',
    confidence: 0.9,
    sourceRepos: ['owner/repo'],
    content,
    wikilinks: [],
  }
}

describe('collectStaticLintIssues', () => {
  it('flags truncated article bodies', () => {
    const issues = collectStaticLintIssues([article('patterns', 'The developer ')], 'en')
    expect(issues.some((issue) => issue.severity === 'error' && issue.article === 'patterns')).toBe(
      true,
    )
  })

  it('flags dual-codebase claims in code-structure', () => {
    const issues = collectStaticLintIssues(
      [article('code-structure', 'Consistent across both javascript and typescript codebases.')],
      'en',
    )
    expect(issues.some((issue) => issue.article === 'code-structure')).toBe(true)
  })

  it('passes complete single-codebase descriptions', () => {
    const issues = collectStaticLintIssues(
      [article('code-structure', 'Single TypeScript codebase with pipeline orchestrators.')],
      'en',
    )
    expect(issues).toHaveLength(0)
  })

  it('emits Japanese messages when output language is ja', () => {
    const issues = collectStaticLintIssues([article('patterns', 'The developer ')], 'ja')
    expect(issues[0]?.message).toContain('途中で切れている')
  })
})

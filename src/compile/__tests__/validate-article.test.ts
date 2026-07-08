import { describe, expect, it } from 'vitest'

import { looksTruncatedArticleContent } from '../validate-article.js'

describe('looksTruncatedArticleContent', () => {
  it('accepts complete sentences', () => {
    expect(looksTruncatedArticleContent('Done.\n\n## Section\n\nAll good.')).toBe(false)
  })

  it('flags ellipsis endings', () => {
    expect(looksTruncatedArticleContent('deleting `extra…')).toBe(true)
  })

  it('flags unclosed backticks', () => {
    expect(looksTruncatedArticleContent('Use `runFetchPipeline')).toBe(true)
  })

  it('flags headings as the final line', () => {
    expect(looksTruncatedArticleContent('Intro.\n\n## Incomplete section')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'

import { withOutputLanguage } from '../output-language.js'

describe('withOutputLanguage', () => {
  it('appends English requirement', () => {
    const prompt = withOutputLanguage('Base prompt', 'en')
    expect(prompt).toContain('Write all prose in English')
  })

  it('appends Japanese requirement', () => {
    const prompt = withOutputLanguage('Base prompt', 'ja')
    expect(prompt).toContain('Write all prose in Japanese')
    expect(prompt).toContain('The developer tends to')
  })
})

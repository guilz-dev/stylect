import { afterEach, describe, expect, it } from 'vitest'

import { resolveLlmApiKey } from '../token.js'

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.CURSOR_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.STYLECT_LLM_API_KEY
})

describe('resolveLlmApiKey', () => {
  it('uses STYLECT_LLM_API_KEY as a fallback for cursor', () => {
    process.env.STYLECT_LLM_API_KEY = 'generic-key'

    expect(resolveLlmApiKey('cursor')).toBe('generic-key')
  })

  it('prefers CURSOR_API_KEY over STYLECT_LLM_API_KEY for cursor', () => {
    process.env.CURSOR_API_KEY = 'cursor-key'
    process.env.STYLECT_LLM_API_KEY = 'generic-key'

    expect(resolveLlmApiKey('cursor')).toBe('cursor-key')
  })
})

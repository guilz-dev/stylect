import { describe, expect, it } from 'vitest'

import { shouldUseCache } from '../cache-policy.js'

describe('shouldUseCache', () => {
  it('hits cache only when not fresh, cache exists, and no new commits', () => {
    expect(shouldUseCache(false, true, 0)).toBe(true)
    expect(shouldUseCache(true, true, 0)).toBe(false)
    expect(shouldUseCache(false, false, 0)).toBe(false)
    expect(shouldUseCache(false, true, 3)).toBe(false)
  })
})

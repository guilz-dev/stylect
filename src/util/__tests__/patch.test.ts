import { describe, expect, it } from 'vitest'

import { MAX_PATCH_BYTES, truncatePatch } from '../patch.js'

describe('truncatePatch', () => {
  it('returns the original patch when under the byte limit', () => {
    const patch = 'line one\nline two\n'
    expect(truncatePatch(patch)).toBe(patch)
  })

  it('truncates by UTF-8 bytes without splitting multibyte characters', () => {
    const patch = `${'a'.repeat(MAX_PATCH_BYTES)}日本語`
    const truncated = truncatePatch(patch)

    expect(Buffer.byteLength(truncated, 'utf8')).toBe(MAX_PATCH_BYTES)
    expect(truncated).toBe('a'.repeat(MAX_PATCH_BYTES))
    expect(Buffer.from(truncated, 'utf8').toString('utf8')).toBe(truncated)
  })
})

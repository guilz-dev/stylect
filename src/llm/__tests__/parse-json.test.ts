import { describe, expect, it } from 'vitest'

import { extractJsonText, parseJsonFromLlm } from '../parse-json.js'

describe('parse-json', () => {
  it('extracts JSON from markdown fence', () => {
    const text = 'Here is the result:\n```json\n{"observations": []}\n```'
    expect(parseJsonFromLlm(text)).toEqual({ observations: [] })
  })

  it('parses raw JSON', () => {
    expect(parseJsonFromLlm('{"passed": true, "issues": []}')).toEqual({
      passed: true,
      issues: [],
    })
  })

  it('extracts from generic code fence', () => {
    expect(extractJsonText('```\n{"a": 1}\n```')).toBe('{"a": 1}')
  })
})

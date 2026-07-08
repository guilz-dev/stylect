import { describe, expect, it } from 'vitest'

import { defaultConfig } from '../../config.js'
import { outputArtifactsExist } from '../up-to-date.js'

describe('outputArtifactsExist', () => {
  it('returns false when wiki output is missing', () => {
    const config = defaultConfig({
      outputDir: '/tmp/nonexistent-wiki-output',
      writeWiki: true,
      writeRules: false,
    })
    expect(outputArtifactsExist(config)).toBe(false)
  })
})

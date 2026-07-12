import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    expect(outputArtifactsExist(config, [])).toBe(false)
  })

  it('returns false when an expected article file is missing', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'stylect-up-to-date-wiki-'))
    const rulesDir = mkdtempSync(join(tmpdir(), 'stylect-up-to-date-rules-'))
    mkdirSync(join(outputDir, '_meta'), { recursive: true })
    mkdirSync(join(outputDir, 'languages'), { recursive: true })
    writeFileSync(join(outputDir, 'index.md'), '# Index\n')
    writeFileSync(join(outputDir, '_meta', 'sources.md'), '# Sources\n')
    writeFileSync(join(outputDir, '_meta', 'generation-config.md'), '# Config\n')
    writeFileSync(join(outputDir, '_meta', 'lint.md'), '# Lint\n')
    writeFileSync(join(outputDir, '_meta', 'generation-log.md'), '# Log\n')
    writeFileSync(join(rulesDir, 'stylect-patterns.mdc'), '---\n---\n')

    const config = defaultConfig({
      outputDir,
      rulesDir,
      writeWiki: true,
      writeRules: true,
    })

    expect(
      outputArtifactsExist(config, [
        {
          slug: 'patterns',
          title: 'Patterns',
          category: 'dimension',
          confidence: 0.8,
          sourceRepos: ['owner/repo'],
          content: 'Uses small modules.',
          wikilinks: [],
        },
      ]),
    ).toBe(false)
  })

  it('returns false when an expected rule file is missing', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'stylect-up-to-date-wiki-'))
    const rulesDir = mkdtempSync(join(tmpdir(), 'stylect-up-to-date-rules-'))
    mkdirSync(join(outputDir, '_meta'), { recursive: true })
    mkdirSync(join(outputDir, 'languages'), { recursive: true })
    writeFileSync(join(outputDir, 'index.md'), '# Index\n')
    writeFileSync(join(outputDir, '_meta', 'sources.md'), '# Sources\n')
    writeFileSync(join(outputDir, '_meta', 'generation-config.md'), '# Config\n')
    writeFileSync(join(outputDir, '_meta', 'lint.md'), '# Lint\n')
    writeFileSync(join(outputDir, '_meta', 'generation-log.md'), '# Log\n')
    writeFileSync(join(outputDir, 'patterns.md'), '# Patterns\n')

    const config = defaultConfig({
      outputDir,
      rulesDir,
      writeWiki: true,
      writeRules: true,
    })

    expect(
      outputArtifactsExist(config, [
        {
          slug: 'patterns',
          title: 'Patterns',
          category: 'dimension',
          confidence: 0.8,
          sourceRepos: ['owner/repo'],
          content: 'Uses small modules.',
          wikilinks: [],
        },
      ]),
    ).toBe(false)
  })
})

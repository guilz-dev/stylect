import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { WikiArticle } from '../../models/article.js'
import {
  cleanupAllOutputArtifacts,
  cleanupStaleRuleFiles,
  cleanupStaleWikiFiles,
} from '../cleanup.js'

const articles: WikiArticle[] = [
  {
    slug: 'patterns',
    title: 'Patterns',
    category: 'dimension',
    confidence: 0.8,
    sourceRepos: ['owner/repo'],
    content: 'content',
    wikilinks: [],
  },
]

describe('cleanupStaleWikiFiles', () => {
  it('removes stale dimension and language markdown files', () => {
    const wikiDir = mkdtempSync(join(tmpdir(), 'stylect-cleanup-wiki-'))
    writeFileSync(join(wikiDir, 'patterns.md'), '# patterns\n')
    writeFileSync(join(wikiDir, 'testing.md'), '# stale\n')
    writeFileSync(join(wikiDir, 'index.md'), '# index\n')
    mkdirSync(join(wikiDir, 'languages'), { recursive: true })
    writeFileSync(join(wikiDir, 'languages', 'ruby.md'), '# ruby\n')

    cleanupStaleWikiFiles(wikiDir, articles)

    expect(existsSync(join(wikiDir, 'patterns.md'))).toBe(true)
    expect(existsSync(join(wikiDir, 'testing.md'))).toBe(false)
    expect(existsSync(join(wikiDir, 'index.md'))).toBe(true)
    expect(existsSync(join(wikiDir, 'languages', 'ruby.md'))).toBe(false)
  })
})

describe('cleanupStaleRuleFiles', () => {
  it('removes stale stylect-*.mdc files', () => {
    const rulesDir = mkdtempSync(join(tmpdir(), 'stylect-cleanup-rules-'))
    writeFileSync(join(rulesDir, 'stylect-patterns.mdc'), '---\n---\n')
    writeFileSync(join(rulesDir, 'stylect-testing.mdc'), '---\n---\n')
    writeFileSync(join(rulesDir, 'other-rule.mdc'), '---\n---\n')

    cleanupStaleRuleFiles(rulesDir, articles)

    expect(existsSync(join(rulesDir, 'stylect-patterns.mdc'))).toBe(true)
    expect(existsSync(join(rulesDir, 'stylect-testing.mdc'))).toBe(false)
    expect(existsSync(join(rulesDir, 'other-rule.mdc'))).toBe(true)
  })
})

describe('cleanupAllOutputArtifacts', () => {
  it('removes generated wiki and rule files when there are no articles', () => {
    const wikiDir = mkdtempSync(join(tmpdir(), 'stylect-cleanup-all-wiki-'))
    const rulesDir = mkdtempSync(join(tmpdir(), 'stylect-cleanup-all-rules-'))
    writeFileSync(join(wikiDir, 'patterns.md'), '# patterns\n')
    writeFileSync(join(wikiDir, 'index.md'), '# index\n')
    mkdirSync(join(wikiDir, '_meta'), { recursive: true })
    writeFileSync(join(wikiDir, '_meta', 'sources.md'), '# sources\n')
    writeFileSync(join(wikiDir, '_meta', 'lint.md'), '# lint\n')
    writeFileSync(join(rulesDir, 'stylect-patterns.mdc'), '---\n---\n')

    cleanupAllOutputArtifacts({
      writeWiki: true,
      writeRules: true,
      outputDir: wikiDir,
      rulesDir,
    })

    expect(existsSync(join(wikiDir, 'patterns.md'))).toBe(false)
    expect(existsSync(join(wikiDir, 'index.md'))).toBe(false)
    expect(existsSync(join(wikiDir, '_meta', 'sources.md'))).toBe(false)
    expect(existsSync(join(wikiDir, '_meta', 'lint.md'))).toBe(false)
    expect(existsSync(join(rulesDir, 'stylect-patterns.mdc'))).toBe(false)
  })
})

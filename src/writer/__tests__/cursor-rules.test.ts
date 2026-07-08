import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { defaultConfig } from '../../config.js'
import type { WikiArticle } from '../../models/article.js'
import type { RepoLlmResult } from '../../pipeline/types.js'
import { writeCursorRules } from '../cursor-rules.js'
import { mergeRepoArtifacts } from '../merge.js'

const article: WikiArticle = {
  slug: 'patterns',
  title: 'Patterns',
  category: 'dimension',
  confidence: 0.8,
  sourceRepos: ['owner/repo'],
  content: 'See [[testing]] for details.',
  wikilinks: ['testing'],
}

const testingArticle: WikiArticle = {
  slug: 'testing',
  title: 'Testing',
  category: 'dimension',
  confidence: 0.7,
  sourceRepos: ['owner/repo'],
  content: 'Uses table-driven tests.',
  wikilinks: [],
}

describe('writeCursorRules', () => {
  it('writes .mdc files with frontmatter and converted wikilinks', () => {
    const rulesDir = mkdtempSync(join(tmpdir(), 'stylect-rules-'))
    const merged = mergeRepoArtifacts([
      {
        repo: 'owner/repo',
        status: 'complete',
        articles: [article, testingArticle],
        lint: {
          passed: false,
          issues: [
            {
              article: 'patterns',
              severity: 'warning',
              message: 'weak evidence',
              suggestion: 'add more commits',
            },
          ],
        },
        newCommitCount: 0,
        upToDate: false,
      } satisfies RepoLlmResult,
    ])
    const config = defaultConfig({ rulesDir, lintFooter: true })

    const result = writeCursorRules(merged, config)

    expect(result.fileCount).toBe(2)
    const patterns = readFileSync(join(rulesDir, 'stylect-patterns.mdc'), 'utf8')
    expect(patterns).toContain('description:')
    expect(patterns).toContain('alwaysApply: false')
    expect(patterns).toContain('globs: "**/*"')
    expect(patterns).toContain('[Testing](testing.md)')
    expect(patterns).toContain('## Lint notes')
    expect(patterns).toContain('weak evidence')
    expect(existsSync(join(rulesDir, 'stylect-testing.mdc'))).toBe(true)
  })

  it('links language articles under languages/', () => {
    const rulesDir = mkdtempSync(join(tmpdir(), 'stylect-rules-lang-'))
    const rubyArticle: WikiArticle = {
      slug: 'ruby',
      title: 'Ruby',
      category: 'language',
      confidence: 0.7,
      sourceRepos: ['owner/repo'],
      content: 'Idiomatic Ruby.',
      wikilinks: [],
    }
    const linkedArticle: WikiArticle = {
      ...article,
      content: 'See [[ruby]] for idioms.',
    }
    const merged = mergeRepoArtifacts([
      {
        repo: 'owner/repo',
        status: 'complete',
        articles: [linkedArticle, rubyArticle],
        lint: { passed: true, issues: [] },
        newCommitCount: 0,
        upToDate: false,
      } satisfies RepoLlmResult,
    ])
    const config = defaultConfig({ rulesDir })

    writeCursorRules(merged, config)

    const patterns = readFileSync(join(rulesDir, 'stylect-patterns.mdc'), 'utf8')
    expect(patterns).toContain('[Ruby](languages/ruby.md)')
  })

  it('removes stale rule files on rewrite', () => {
    const rulesDir = mkdtempSync(join(tmpdir(), 'stylect-rules-stale-'))
    writeFileSync(join(rulesDir, 'stylect-patterns.mdc'), 'old')
    writeFileSync(join(rulesDir, 'stylect-testing.mdc'), 'stale')

    const merged = mergeRepoArtifacts([
      {
        repo: 'owner/repo',
        status: 'complete',
        articles: [article],
        lint: { passed: true, issues: [] },
        newCommitCount: 0,
        upToDate: false,
      } satisfies RepoLlmResult,
    ])
    const config = defaultConfig({ rulesDir })

    writeCursorRules(merged, config)

    expect(existsSync(join(rulesDir, 'stylect-patterns.mdc'))).toBe(true)
    expect(existsSync(join(rulesDir, 'stylect-testing.mdc'))).toBe(false)
  })
})

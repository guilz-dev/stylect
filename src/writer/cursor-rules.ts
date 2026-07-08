import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import type { WikiArticle } from '../models/article.js'
import type { LintIssue } from '../models/lint-report.js'
import { cleanupStaleRuleFiles } from './cleanup.js'
import { renderYamlFrontmatter } from './frontmatter.js'
import { globsForArticle } from './globs.js'
import type { MergedArtifacts } from './types.js'
import { convertWikilinksToMarkdown } from './wikilinks.js'

export function writeCursorRules(
  merged: MergedArtifacts,
  config: StylectConfig,
): { dir: string; fileCount: number } {
  const rulesDir = config.rulesDir
  cleanupStaleRuleFiles(rulesDir, merged.articles)
  mkdirSync(rulesDir, { recursive: true })

  let fileCount = 0
  for (const article of merged.articles) {
    const path = join(rulesDir, `stylect-${article.slug}.mdc`)
    writeFileSync(
      path,
      renderRuleFile(article, merged.articles, merged.lint.issues, config),
      'utf8',
    )
    fileCount += 1
  }

  return { dir: rulesDir, fileCount }
}

function renderRuleFile(
  article: WikiArticle,
  allArticles: WikiArticle[],
  issues: LintIssue[],
  config: StylectConfig,
): string {
  const frontmatter = renderYamlFrontmatter({
    description: `${article.title} mined from git history (stylect)`,
    alwaysApply: false,
    globs: globsForArticle(article),
  })

  const body = convertWikilinksToMarkdown(article.content.trim(), allArticles)
  const footer = config.lintFooter ? renderLintFooter(article.slug, issues) : ''

  return `${frontmatter}\n\n# ${article.title}\n\n${body}${footer}\n`
}

function renderLintFooter(slug: string, issues: LintIssue[]): string {
  const articleIssues = issues.filter((issue) => issue.article === slug)
  if (articleIssues.length === 0) {
    return ''
  }

  const lines = ['', '## Lint notes', '']
  for (const issue of articleIssues) {
    const suggestion = issue.suggestion ? ` — ${issue.suggestion}` : ''
    lines.push(`- [${issue.severity}] ${issue.message}${suggestion}`)
  }
  return `${lines.join('\n')}\n`
}

import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import {
  articlesPath,
  cacheFileExists,
  isOutputLanguageCacheCompatible,
  lintPath,
  llmMetaPath,
  loadLint,
  loadLlmMeta,
  saveLint,
  saveLlmMeta,
  shouldUseLlmCache,
} from '../llm/cache.js'
import { completeJson, type LlmConfig } from '../llm/cursor.js'
import { withOutputLanguage } from '../llm/output-language.js'
import type { WikiArticle } from '../models/article.js'
import type { LintIssue, LintReport, LintSeverity } from '../models/lint-report.js'
import { LINT_SYSTEM } from './prompt.js'
import { collectStaticLintIssues } from './static.js'

export type LintResult = {
  report: LintReport
  fromCache: boolean
}

function buildLintPrompt(articles: WikiArticle[]): string {
  const lines = [`Wiki contains ${articles.length} articles:\n`]
  const existingSlugs = articles.map((article) => article.slug)

  for (const article of articles) {
    lines.push(`## ${article.slug} (confidence: ${Math.round(article.confidence * 100)}%)`)
    lines.push(`Category: ${article.category}`)
    lines.push(`Wikilinks: ${article.wikilinks.join(', ')}`)
    lines.push(article.content.slice(0, 2000))
    lines.push('')
  }

  lines.push(`\nExisting article slugs: ${existingSlugs.sort().join(', ')}`)
  return lines.join('\n')
}

function parseSeverity(value: unknown): LintSeverity {
  if (value === 'info' || value === 'warning' || value === 'error') {
    return value
  }
  return 'warning'
}

function parseLintReport(data: unknown): LintReport {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const rawIssues = Array.isArray(record.issues) ? record.issues : []
  const issues: LintIssue[] = []

  for (const entry of rawIssues) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const issue = entry as Record<string, unknown>
    const article = typeof issue.article === 'string' ? issue.article : '_meta'
    const message = typeof issue.message === 'string' ? issue.message : 'Unknown issue'
    const severity = parseSeverity(issue.severity)
    const suggestion = typeof issue.suggestion === 'string' ? issue.suggestion : undefined
    issues.push({ article, severity, message, suggestion })
  }

  const passed = typeof record.passed === 'boolean' ? record.passed : issues.length === 0
  return { issues, passed }
}

export async function lintWiki(
  articles: WikiArticle[],
  config: StylectConfig,
  opts: { slug: string; newCommitCount: number; llm: LlmConfig },
): Promise<LintResult> {
  const repoCacheDir = join(config.cacheDir, opts.slug)
  const cachePath = lintPath(repoCacheDir)
  const articlesCachePath = articlesPath(repoCacheDir)
  const outputLanguageCompatible = isOutputLanguageCacheCompatible(
    loadLlmMeta(llmMetaPath(repoCacheDir)),
    config.outputLanguage,
  )

  if (
    outputLanguageCompatible &&
    shouldUseLlmCache(config.fresh, cacheFileExists(cachePath), opts.newCommitCount) &&
    cacheFileExists(articlesCachePath)
  ) {
    return { report: loadLint(cachePath), fromCache: true }
  }

  if (articles.length === 0) {
    return { report: { issues: [], passed: true }, fromCache: false }
  }

  const staticIssues = collectStaticLintIssues(articles, config.outputLanguage)

  try {
    const data = await completeJson(
      opts.llm,
      withOutputLanguage(LINT_SYSTEM, config.outputLanguage),
      buildLintPrompt(articles),
    )
    const report = parseLintReport(data)
    const issues = [...staticIssues, ...report.issues]
    const merged: LintReport = {
      issues,
      passed: report.passed && staticIssues.length === 0,
    }
    saveLint(cachePath, merged)
    saveLlmMeta(llmMetaPath(repoCacheDir), { output_language: config.outputLanguage })
    return { report: merged, fromCache: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const report: LintReport = {
      issues: [
        {
          article: '_meta',
          severity: 'error',
          message: `Lint failed: ${message}`,
        },
      ],
      passed: false,
    }
    saveLint(cachePath, report)
    saveLlmMeta(llmMetaPath(repoCacheDir), { output_language: config.outputLanguage })
    return { report, fromCache: false }
  }
}

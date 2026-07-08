import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import type { WikiArticle } from '../models/article.js'
import { cleanupStaleWikiFiles } from './cleanup.js'
import { renderYamlFrontmatter } from './frontmatter.js'
import type { MergedArtifacts } from './types.js'
import { normalizeWikiWikilinks } from './wikilinks.js'

export function writeWiki(
  merged: MergedArtifacts,
  config: StylectConfig,
): { dir: string; fileCount: number } {
  const wikiDir = config.outputDir
  cleanupStaleWikiFiles(wikiDir, merged.articles)
  mkdirSync(join(wikiDir, 'languages'), { recursive: true })
  mkdirSync(join(wikiDir, '_meta'), { recursive: true })

  let fileCount = 0

  for (const article of merged.articles) {
    const path =
      article.category === 'language'
        ? join(wikiDir, 'languages', `${article.slug}.md`)
        : join(wikiDir, `${article.slug}.md`)
    writeFileSync(path, renderWikiArticle(article, merged.articles), 'utf8')
    fileCount += 1
  }

  writeFileSync(join(wikiDir, 'index.md'), renderIndex(merged.articles), 'utf8')
  fileCount += 1

  writeFileSync(join(wikiDir, '_meta', 'sources.md'), renderSources(merged), 'utf8')
  writeFileSync(
    join(wikiDir, '_meta', 'generation-config.md'),
    renderGenerationConfig(config),
    'utf8',
  )
  writeFileSync(join(wikiDir, '_meta', 'generation-log.md'), renderGenerationLog(merged), 'utf8')
  fileCount += 3

  return { dir: wikiDir, fileCount }
}

function renderWikiArticle(article: WikiArticle, allArticles: WikiArticle[]): string {
  const frontmatter = renderYamlFrontmatter({
    title: article.title,
    category: article.category,
    confidence: article.confidence,
    sourceRepos: article.sourceRepos,
    wikilinks: article.wikilinks,
  })
  const content = normalizeWikiWikilinks(article.content.trim(), allArticles)
  return `${frontmatter}\n\n${content}\n`
}

function renderIndex(articles: WikiArticle[]): string {
  const dimensions = articles.filter((article) => article.category === 'dimension')
  const languages = articles.filter((article) => article.category === 'language')

  const lines = [
    '# Stylect Wiki',
    '',
    'Coding style mined from git history.',
    '',
    '## Style dimensions',
    '',
  ]

  for (const article of dimensions) {
    lines.push(`- [[${article.slug}|${article.title}]]`)
  }

  if (languages.length > 0) {
    lines.push('', '## Languages', '')
    for (const article of languages) {
      lines.push(`- [[languages/${article.slug}|${article.title}]]`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

function renderSources(merged: MergedArtifacts): string {
  const lines = ['# Sources', '']
  for (const repo of merged.sourceRepos) {
    const count = merged.articles.filter((article) => article.sourceRepos.includes(repo)).length
    lines.push(`- ${repo}: ${count} articles`)
  }
  lines.push('')
  return lines.join('\n')
}

function renderGenerationConfig(config: StylectConfig): string {
  const lines = [
    '# Generation config',
    '',
    `- author: ${config.author ?? '(none)'}`,
    `- repos: ${config.repos.join(', ')}`,
    `- maxCommits: ${config.maxCommits}`,
    `- samplesPerGroup: ${config.samplesPerGroup}`,
    `- model: ${config.model}`,
    `- output: ${config.outputDir}`,
    `- rulesDir: ${config.rulesDir}`,
    '',
  ]
  return lines.join('\n')
}

function renderGenerationLog(merged: MergedArtifacts): string {
  const lines = [
    '# Generation log',
    '',
    '## Merged repos',
    '',
    ...merged.sourceRepos.map((repo) => `- ${repo}`),
    '',
    '## Articles',
    '',
    ...merged.articles.map(
      (article) =>
        `- ${article.slug} (${article.category}, confidence ${Math.round(article.confidence * 100)}%)`,
    ),
  ]

  if (merged.mergeLog.length > 0) {
    lines.push(
      '',
      '## Slug overwrites (later repo wins)',
      '',
      ...merged.mergeLog.map((line) => `- ${line}`),
    )
  }

  lines.push(
    '',
    '## Lint',
    '',
    `- passed: ${merged.lint.passed}`,
    `- issues: ${merged.lint.issues.length}`,
    '',
  )
  return lines.join('\n')
}

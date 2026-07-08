import { type Dirent, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import type { WikiArticle } from '../models/article.js'

export function cleanupStaleWikiFiles(wikiDir: string, articles: WikiArticle[]): void {
  const dimensionSlugs = new Set(
    articles.filter((article) => article.category === 'dimension').map((article) => article.slug),
  )
  const languageSlugs = new Set(
    articles.filter((article) => article.category === 'language').map((article) => article.slug),
  )

  cleanupDirectoryFiles(wikiDir, (name) => {
    if (!name.endsWith('.md') || name === 'index.md') {
      return false
    }
    const slug = name.slice(0, -3)
    return !dimensionSlugs.has(slug)
  })

  cleanupDirectoryFiles(join(wikiDir, 'languages'), (name) => {
    if (!name.endsWith('.md')) {
      return false
    }
    const slug = name.slice(0, -3)
    return !languageSlugs.has(slug)
  })
}

export function cleanupStaleRuleFiles(rulesDir: string, articles: WikiArticle[]): void {
  const slugs = new Set(articles.map((article) => article.slug))

  cleanupDirectoryFiles(rulesDir, (name) => {
    if (!name.startsWith('stylect-') || !name.endsWith('.mdc')) {
      return false
    }
    const slug = name.slice('stylect-'.length, -'.mdc'.length)
    return !slugs.has(slug)
  })
}

/** Remove all generated wiki and rule outputs when there are no articles to write. */
export function cleanupAllOutputArtifacts(config: {
  writeWiki: boolean
  writeRules: boolean
  outputDir: string
  rulesDir: string
}): void {
  if (config.writeWiki) {
    cleanupStaleWikiFiles(config.outputDir, [])
    cleanupDirectoryFiles(config.outputDir, (name) => name === 'index.md')
    cleanupDirectoryFiles(join(config.outputDir, '_meta'), () => true)
  }

  if (config.writeRules) {
    cleanupStaleRuleFiles(config.rulesDir, [])
  }
}

function cleanupDirectoryFiles(dir: string, shouldRemove: (fileName: string) => boolean): void {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isFile() || !shouldRemove(entry.name)) {
      continue
    }
    unlinkSync(join(dir, entry.name))
  }
}

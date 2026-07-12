import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import type { WikiArticle } from '../models/article.js'

export function outputArtifactsExist(config: StylectConfig, articles: WikiArticle[]): boolean {
  if (config.writeWiki) {
    const expectedWikiPaths = [
      join(config.outputDir, 'index.md'),
      join(config.outputDir, '_meta', 'sources.md'),
      join(config.outputDir, '_meta', 'generation-config.md'),
      join(config.outputDir, '_meta', 'lint.md'),
      join(config.outputDir, '_meta', 'generation-log.md'),
      ...articles.map((article) =>
        article.category === 'language'
          ? join(config.outputDir, 'languages', `${article.slug}.md`)
          : join(config.outputDir, `${article.slug}.md`),
      ),
    ]

    if (!expectedWikiPaths.every((path) => existsSync(path))) {
      return false
    }
  }

  if (!config.writeRules) {
    return true
  }

  if (!existsSync(config.rulesDir)) {
    return false
  }

  try {
    const actual = new Set(
      readdirSync(config.rulesDir).filter(
        (entry) => entry.startsWith('stylect-') && entry.endsWith('.mdc'),
      ),
    )
    return articles.every((article) => actual.has(`stylect-${article.slug}.mdc`))
  } catch {
    return false
  }
}

import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import {
  articlesPath,
  cacheFileExists,
  extractionsPath,
  loadArticles,
  saveArticles,
  shouldUseLlmCache,
} from '../llm/cache.js'
import { completeJson, type LlmConfig } from '../llm/cursor.js'
import type { WikiArticle } from '../models/article.js'
import type { ClusterExtraction } from '../models/extraction.js'
import { STYLE_DIMENSIONS } from '../models/style-dimension.js'
import {
  buildDimensionPrompt,
  buildLanguagePrompt,
  fixWikilinks,
  groupObservations,
  slugifyLanguage,
  validCompileSlugs,
} from './merge.js'
import { COMPILE_SYSTEM, LANGUAGE_COMPILE_SYSTEM } from './prompt.js'

export type CompileResult = {
  articles: WikiArticle[]
  fromCache: boolean
  failedSlugs: string[]
}

function parseArticleData(
  data: unknown,
  slug: string,
  category: WikiArticle['category'],
  sourceRepos: string[],
  fallbackTitle: string,
): WikiArticle {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const title = typeof record.title === 'string' ? record.title : fallbackTitle
  const content = typeof record.content === 'string' ? record.content : ''
  const confidence =
    typeof record.confidence === 'number' && record.confidence >= 0 && record.confidence <= 1
      ? record.confidence
      : 0.5
  const wikilinks = Array.isArray(record.wikilinks)
    ? record.wikilinks.filter((link): link is string => typeof link === 'string')
    : []

  return { slug, title, category, confidence, sourceRepos, content, wikilinks }
}

export async function compileWiki(
  extractions: ClusterExtraction[],
  config: StylectConfig,
  opts: { slug: string; newCommitCount: number; llm: LlmConfig },
): Promise<CompileResult> {
  const repoCacheDir = join(config.cacheDir, opts.slug)
  const cachePath = articlesPath(repoCacheDir)
  const extractionsCachePath = extractionsPath(repoCacheDir)

  if (
    shouldUseLlmCache(config.fresh, cacheFileExists(cachePath), opts.newCommitCount) &&
    cacheFileExists(extractionsCachePath)
  ) {
    return { articles: loadArticles(cachePath), fromCache: true, failedSlugs: [] }
  }

  const { byDimension, byLanguage, repos } = groupObservations(extractions)
  const reposList = [...repos].sort()
  const validSlugs = validCompileSlugs(byDimension, byLanguage)

  const articles: WikiArticle[] = []
  const failedSlugs: string[] = []

  for (const dimension of STYLE_DIMENSIONS) {
    const observations = byDimension.get(dimension) ?? []
    if (observations.length === 0) {
      continue
    }

    try {
      const data = await completeJson(
        opts.llm,
        COMPILE_SYSTEM,
        buildDimensionPrompt(dimension, observations, validSlugs),
      )
      articles.push(
        parseArticleData(
          data,
          dimension,
          'dimension',
          reposList,
          dimension.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        ),
      )
    } catch (error) {
      failedSlugs.push(dimension)
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`compile: skipped ${dimension}: ${message}\n`)
    }
  }

  for (const [language, observations] of [...byLanguage.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (observations.length === 0) {
      continue
    }
    const slug = slugifyLanguage(language)
    try {
      const data = await completeJson(
        opts.llm,
        LANGUAGE_COMPILE_SYSTEM,
        buildLanguagePrompt(language, observations, validSlugs),
      )
      articles.push(parseArticleData(data, slug, 'language', reposList, `${language} Style`))
    } catch (error) {
      failedSlugs.push(slug)
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`compile: skipped ${language}: ${message}\n`)
    }
  }

  if (articles.length > 0) {
    const fixed = fixWikilinks(articles)
    saveArticles(cachePath, fixed)
    return { articles: fixed, fromCache: false, failedSlugs }
  }

  return { articles: [], fromCache: false, failedSlugs }
}

import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import {
  articlesPath,
  cacheFileExists,
  extractionsPath,
  isOutputLanguageCacheCompatible,
  llmMetaPath,
  loadArticles,
  loadLlmMeta,
  saveArticles,
  saveLlmMeta,
  shouldUseLlmCache,
} from '../llm/cache.js'
import { completeJson, type LlmConfig } from '../llm/cursor.js'
import { withOutputLanguage } from '../llm/output-language.js'
import type { WikiArticle } from '../models/article.js'
import type { ClusterExtraction } from '../models/extraction.js'
import { STYLE_DIMENSIONS } from '../models/style-dimension.js'
import {
  affectedCompileSlugs,
  buildEvolveDimensionPrompt,
  buildEvolveLanguagePrompt,
} from './evolve.js'
import {
  buildDimensionPrompt,
  buildLanguagePrompt,
  fixWikilinks,
  groupObservations,
  slugifyLanguage,
  validCompileSlugs,
} from './merge.js'
import {
  COMPILE_SYSTEM,
  EVOLVE_DIMENSION_SYSTEM,
  EVOLVE_LANGUAGE_SYSTEM,
  LANGUAGE_COMPILE_SYSTEM,
} from './prompt.js'
import { looksTruncatedArticleContent } from './validate-article.js'

const COMPILE_TRUNCATION_RETRIES = 3

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

async function compileArticleJson(
  llm: LlmConfig,
  system: string,
  prompt: string,
  slug: string,
): Promise<unknown> {
  let currentPrompt = prompt
  let lastData: unknown
  let lastContent = ''

  for (let attempt = 0; attempt <= COMPILE_TRUNCATION_RETRIES; attempt += 1) {
    const data = await completeJson(llm, system, currentPrompt)
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const content = typeof record.content === 'string' ? record.content : ''
    lastData = data
    lastContent = content

    if (!looksTruncatedArticleContent(content)) {
      return data
    }

    if (attempt >= COMPILE_TRUNCATION_RETRIES) {
      break
    }

    currentPrompt = `${prompt}\n\nIMPORTANT: Your previous response was cut off mid-sentence. Return the FULL article with complete final sentences and sections.`
  }

  if (lastContent.trim().length > 0) {
    process.stderr.write(
      `compile: warning: article "${slug}" may be truncated; keeping last LLM response\n`,
    )
    return lastData
  }

  throw new Error(`compiled article "${slug}" looks truncated`)
}

function preserveUncompiledArticles(
  articles: WikiArticle[],
  existingArticles: WikiArticle[],
  validSlugs: string[],
): WikiArticle[] {
  const writtenSlugs = new Set(articles.map((article) => article.slug))
  const valid = new Set(validSlugs)
  const preserved = existingArticles.filter(
    (article) => !writtenSlugs.has(article.slug) && valid.has(article.slug),
  )
  return [...articles, ...preserved].sort((left, right) => left.slug.localeCompare(right.slug))
}

export async function compileWiki(
  extractions: ClusterExtraction[],
  config: StylectConfig,
  opts: {
    slug: string
    newCommitCount: number
    llm: LlmConfig
    deltaExtractions?: ClusterExtraction[]
  },
): Promise<CompileResult> {
  const repoCacheDir = join(config.cacheDir, opts.slug)
  const cachePath = articlesPath(repoCacheDir)
  const extractionsCachePath = extractionsPath(repoCacheDir)
  const outputLanguageCompatible = isOutputLanguageCacheCompatible(
    loadLlmMeta(llmMetaPath(repoCacheDir)),
    config.outputLanguage,
  )

  if (
    outputLanguageCompatible &&
    shouldUseLlmCache(config.fresh, cacheFileExists(cachePath), opts.newCommitCount) &&
    cacheFileExists(extractionsCachePath)
  ) {
    return { articles: loadArticles(cachePath), fromCache: true, failedSlugs: [] }
  }

  const existingArticles =
    cacheFileExists(cachePath) && opts.newCommitCount > 0 ? loadArticles(cachePath) : []
  const deltaExtractions = opts.deltaExtractions ?? []
  const incremental =
    !config.fresh &&
    opts.newCommitCount > 0 &&
    existingArticles.length > 0 &&
    outputLanguageCompatible
  const { byDimension, byLanguage, repos } = groupObservations(extractions)
  const validSlugs = validCompileSlugs(byDimension, byLanguage)
  const affectedSlugs = incremental ? affectedCompileSlugs(deltaExtractions) : undefined

  if (incremental && affectedSlugs && affectedSlugs.size === 0) {
    const valid = new Set(validSlugs)
    const filtered = existingArticles.filter((article) => valid.has(article.slug))
    if (filtered.length !== existingArticles.length) {
      const fixed = fixWikilinks(filtered)
      saveArticles(cachePath, fixed)
      return { articles: fixed, fromCache: false, failedSlugs: [] }
    }
    return { articles: existingArticles, fromCache: true, failedSlugs: [] }
  }

  const deltaGrouped = incremental ? groupObservations(deltaExtractions) : null
  const reposList = [...repos].sort()
  const existingBySlug = new Map(existingArticles.map((article) => [article.slug, article]))

  const articles: WikiArticle[] = []
  const failedSlugs: string[] = []

  for (const dimension of STYLE_DIMENSIONS) {
    const observations = byDimension.get(dimension) ?? []
    const existing = existingBySlug.get(dimension)

    if (observations.length === 0) {
      continue
    }

    if (incremental && affectedSlugs && !affectedSlugs.has(dimension) && existing) {
      articles.push(existing)
      continue
    }

    const evolveObservations =
      incremental && existing && deltaGrouped
        ? (deltaGrouped.byDimension.get(dimension) ?? [])
        : observations

    try {
      const system = withOutputLanguage(
        existing ? EVOLVE_DIMENSION_SYSTEM : COMPILE_SYSTEM,
        config.outputLanguage,
      )
      const prompt = existing
        ? buildEvolveDimensionPrompt(dimension, existing, evolveObservations, validSlugs)
        : buildDimensionPrompt(dimension, observations, validSlugs)
      const data = await compileArticleJson(opts.llm, system, prompt, dimension)
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
      if (existing) {
        articles.push(existing)
      }
    }
  }

  for (const [language, observations] of [...byLanguage.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const slug = slugifyLanguage(language)
    const existing = existingBySlug.get(slug)

    if (observations.length === 0) {
      continue
    }

    if (incremental && affectedSlugs && !affectedSlugs.has(slug) && existing) {
      articles.push(existing)
      continue
    }

    const evolveObservations =
      incremental && existing && deltaGrouped
        ? (deltaGrouped.byLanguage.get(language) ?? [])
        : observations

    try {
      const system = withOutputLanguage(
        existing ? EVOLVE_LANGUAGE_SYSTEM : LANGUAGE_COMPILE_SYSTEM,
        config.outputLanguage,
      )
      const prompt = existing
        ? buildEvolveLanguagePrompt(language, existing, evolveObservations, validSlugs)
        : buildLanguagePrompt(language, observations, validSlugs)
      const data = await compileArticleJson(opts.llm, system, prompt, slug)
      articles.push(parseArticleData(data, slug, 'language', reposList, `${language} Style`))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`compile: skipped ${language}: ${message}\n`)
      if (existing) {
        articles.push(existing)
      }
    }
  }

  const combined = preserveUncompiledArticles(articles, existingArticles, validSlugs)

  if (combined.length > 0) {
    const fixed = fixWikilinks(combined)
    saveArticles(cachePath, fixed)
    saveLlmMeta(llmMetaPath(repoCacheDir), { output_language: config.outputLanguage })
    return { articles: fixed, fromCache: false, failedSlugs }
  }

  return { articles: [], fromCache: false, failedSlugs }
}

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { OutputLanguage } from '../config.js'
import { ensureParentDir } from '../fetch/cache.js'
import type { WikiArticle } from '../models/article.js'
import type { ClusterExtraction } from '../models/extraction.js'
import type { LintReport } from '../models/lint-report.js'
import {
  deserializeClusterExtraction,
  deserializeLintReport,
  deserializeWikiArticle,
  serializeClusterExtraction,
  serializeLintReport,
  serializeWikiArticle,
} from '../models/serialize-llm.js'
import { shouldUseCache } from '../util/cache-policy.js'

export function extractionsPath(cacheDir: string): string {
  return join(cacheDir, 'extractions.json')
}

export function articlesPath(cacheDir: string): string {
  return join(cacheDir, 'articles.json')
}

export function lintPath(cacheDir: string): string {
  return join(cacheDir, 'lint.json')
}

export function llmMetaPath(cacheDir: string): string {
  return join(cacheDir, 'llm-meta.json')
}

export type LlmCacheMeta = {
  output_language: OutputLanguage
}

export function shouldUseLlmCache(
  fresh: boolean,
  cacheExists: boolean,
  newCommitCount: number,
): boolean {
  return shouldUseCache(fresh, cacheExists, newCommitCount)
}

function removeIfExists(path: string): void {
  if (existsSync(path)) {
    rmSync(path, { force: true })
  }
}

/** Drop all LLM caches when upstream samples change. */
export function invalidateAllLlmCache(repoCacheDir: string): void {
  removeIfExists(extractionsPath(repoCacheDir))
  removeIfExists(articlesPath(repoCacheDir))
  removeIfExists(lintPath(repoCacheDir))
  removeIfExists(llmMetaPath(repoCacheDir))
}

/** Drop downstream caches when extractions are rewritten. */
export function invalidateCompileCache(repoCacheDir: string): void {
  removeIfExists(articlesPath(repoCacheDir))
  removeIfExists(lintPath(repoCacheDir))
}

/** Drop lint cache when articles are rewritten. */
export function invalidateLintCache(repoCacheDir: string): void {
  removeIfExists(lintPath(repoCacheDir))
}

export function loadExtractions(path: string): ClusterExtraction[] {
  const data = JSON.parse(readFileSync(path, 'utf8')) as unknown[]
  return data.map((entry) => deserializeClusterExtraction(entry as never))
}

export function saveExtractions(path: string, extractions: ClusterExtraction[]): void {
  ensureParentDir(path)
  invalidateCompileCache(dirname(path))
  const serialized = extractions.map(serializeClusterExtraction)
  writeFileSync(path, `${JSON.stringify(serialized, null, 2)}\n`, 'utf8')
}

export function loadArticles(path: string): WikiArticle[] {
  const data = JSON.parse(readFileSync(path, 'utf8')) as unknown[]
  return data.map((entry) => deserializeWikiArticle(entry as never))
}

export function saveArticles(path: string, articles: WikiArticle[]): void {
  ensureParentDir(path)
  invalidateLintCache(dirname(path))
  const serialized = articles.map(serializeWikiArticle)
  writeFileSync(path, `${JSON.stringify(serialized, null, 2)}\n`, 'utf8')
}

export function loadLint(path: string): LintReport {
  return deserializeLintReport(JSON.parse(readFileSync(path, 'utf8')))
}

export function saveLint(path: string, report: LintReport): void {
  ensureParentDir(path)
  writeFileSync(path, `${JSON.stringify(serializeLintReport(report), null, 2)}\n`, 'utf8')
}

export function loadLlmMeta(path: string): LlmCacheMeta | undefined {
  if (!existsSync(path)) {
    return undefined
  }
  return JSON.parse(readFileSync(path, 'utf8')) as LlmCacheMeta
}

export function saveLlmMeta(path: string, meta: LlmCacheMeta): void {
  ensureParentDir(path)
  writeFileSync(path, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
}

export function isOutputLanguageCacheCompatible(
  meta: LlmCacheMeta | undefined,
  outputLanguage: OutputLanguage,
): boolean {
  // Old caches (before llm-meta.json) are treated as English outputs.
  const cached = meta?.output_language ?? 'en'
  return cached === outputLanguage
}

export function cacheFileExists(path: string): boolean {
  return existsSync(path)
}

import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import {
  articlesPath,
  cacheFileExists,
  extractionsPath,
  isOutputLanguageCacheCompatible,
  lintPath,
  llmMetaPath,
  loadLlmMeta,
} from '../llm/cache.js'
import { shouldUseCache } from './cache-policy.js'

export type LlmStageNeeds = {
  extract: boolean
  compile: boolean
  lint: boolean
}

export function stageUsesLlmCache(
  config: StylectConfig,
  cachePath: string,
  newCommitCount: number,
): boolean {
  return shouldUseCache(config.fresh, cacheFileExists(cachePath), newCommitCount)
}

export function resolveLlmStageNeeds(
  config: StylectConfig,
  slug: string,
  newCommitCount: number,
  deltaClusterCount: number,
): LlmStageNeeds {
  if (config.skipLlm) {
    return { extract: false, compile: false, lint: false }
  }

  const repoCacheDir = join(config.cacheDir, slug)
  const outputLanguageCompatible = isOutputLanguageCacheCompatible(
    loadLlmMeta(llmMetaPath(repoCacheDir)),
    config.outputLanguage,
  )

  if (config.fresh) {
    return { extract: true, compile: true, lint: true }
  }

  if (newCommitCount > 0 && deltaClusterCount === 0) {
    return {
      extract: !stageUsesLlmCache(config, extractionsPath(repoCacheDir), 0),
      compile:
        !stageUsesLlmCache(config, articlesPath(repoCacheDir), 0) || !outputLanguageCompatible,
      lint: !stageUsesLlmCache(config, lintPath(repoCacheDir), 0) || !outputLanguageCompatible,
    }
  }

  if (newCommitCount > 0 && deltaClusterCount > 0) {
    return { extract: true, compile: true, lint: true }
  }

  const extract = !stageUsesLlmCache(config, extractionsPath(repoCacheDir), newCommitCount)
  const compile =
    !stageUsesLlmCache(config, articlesPath(repoCacheDir), newCommitCount) ||
    !outputLanguageCompatible
  const lint =
    !stageUsesLlmCache(config, lintPath(repoCacheDir), newCommitCount) || !outputLanguageCompatible

  return { extract, compile, lint }
}

export function repoNeedsLlm(
  config: StylectConfig,
  slug: string,
  newCommitCount: number,
  deltaClusterCount: number,
): boolean {
  const needs = resolveLlmStageNeeds(config, slug, newCommitCount, deltaClusterCount)
  return needs.extract || needs.compile || needs.lint
}

export function needsCursorApiKey(
  config: StylectConfig,
  opts: { slug: string; newCommitCount: number; deltaClusterCount: number },
): boolean {
  if (config.plan || config.skipLlm) {
    return false
  }
  return repoNeedsLlm(config, opts.slug, opts.newCommitCount, opts.deltaClusterCount)
}

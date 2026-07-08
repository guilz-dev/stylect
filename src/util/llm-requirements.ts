import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import { articlesPath, cacheFileExists, extractionsPath, lintPath } from '../llm/cache.js'
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
  samplesRecalculated: boolean,
): LlmStageNeeds {
  if (config.skipLlm) {
    return { extract: false, compile: false, lint: false }
  }

  const repoCacheDir = join(config.cacheDir, slug)

  if (config.fresh || newCommitCount > 0 || samplesRecalculated) {
    return { extract: true, compile: true, lint: true }
  }

  const extract = !stageUsesLlmCache(config, extractionsPath(repoCacheDir), newCommitCount)
  const compile = !stageUsesLlmCache(config, articlesPath(repoCacheDir), newCommitCount)
  const lint = !stageUsesLlmCache(config, lintPath(repoCacheDir), newCommitCount)

  return { extract, compile, lint }
}

export function repoNeedsLlm(
  config: StylectConfig,
  slug: string,
  newCommitCount: number,
  samplesRecalculated: boolean,
): boolean {
  const needs = resolveLlmStageNeeds(config, slug, newCommitCount, samplesRecalculated)
  return needs.extract || needs.compile || needs.lint
}

export function needsCursorApiKey(
  config: StylectConfig,
  opts: { slug: string; newCommitCount: number; samplesRecalculated: boolean },
): boolean {
  if (config.plan || config.skipLlm) {
    return false
  }
  return repoNeedsLlm(config, opts.slug, opts.newCommitCount, opts.samplesRecalculated)
}

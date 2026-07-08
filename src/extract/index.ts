import { join } from 'node:path'

import type { StylectConfig } from '../config.js'
import {
  cacheFileExists,
  extractionsPath,
  invalidateCompileCache,
  loadExtractions,
  saveExtractions,
  shouldUseLlmCache,
} from '../llm/cache.js'
import { completeJson, type LlmConfig } from '../llm/cursor.js'
import type { SampledCluster } from '../models/cluster.js'
import type { ClusterExtraction } from '../models/extraction.js'
import type { Observation } from '../models/observation.js'
import { parseStyleDimension } from '../models/style-dimension.js'
import { buildExtractPrompt } from './build-prompt.js'
import { EXTRACT_SYSTEM } from './prompt.js'

export type ExtractResult = {
  extractions: ClusterExtraction[]
  fromCache: boolean
  skippedClusters: number
}

function parseObservations(data: unknown): Observation[] {
  if (!data || typeof data !== 'object' || !('observations' in data)) {
    return []
  }
  const raw = (data as { observations: unknown }).observations
  if (!Array.isArray(raw)) {
    return []
  }

  const observations: Observation[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const record = entry as Record<string, unknown>
    const dimension =
      typeof record.dimension === 'string' ? parseStyleDimension(record.dimension) : undefined
    const claim = typeof record.claim === 'string' ? record.claim : undefined
    if (!dimension || !claim) {
      continue
    }
    const evidence = Array.isArray(record.evidence)
      ? record.evidence.filter((sha): sha is string => typeof sha === 'string')
      : []
    const confidence =
      typeof record.confidence === 'number' && record.confidence >= 0 && record.confidence <= 1
        ? record.confidence
        : 0.7
    const language = typeof record.language === 'string' ? record.language : undefined
    observations.push({ dimension, claim, evidence, confidence, language })
  }
  return observations
}

export async function extractClusters(
  clusters: SampledCluster[],
  config: StylectConfig,
  opts: { slug: string; newCommitCount: number; llm: LlmConfig },
): Promise<ExtractResult> {
  const repoCacheDir = join(config.cacheDir, opts.slug)
  const cachePath = extractionsPath(repoCacheDir)

  if (shouldUseLlmCache(config.fresh, cacheFileExists(cachePath), opts.newCommitCount)) {
    return { extractions: loadExtractions(cachePath), fromCache: true, skippedClusters: 0 }
  }

  invalidateCompileCache(repoCacheDir)

  const extractions: ClusterExtraction[] = []
  let skippedClusters = 0

  for (const cluster of clusters) {
    try {
      const data = await completeJson(opts.llm, EXTRACT_SYSTEM, buildExtractPrompt(cluster))
      extractions.push({
        repo: cluster.repo,
        language: cluster.language,
        observations: parseObservations(data),
      })
    } catch (error) {
      skippedClusters += 1
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`extract: skipped ${cluster.repo}/${cluster.language}: ${message}\n`)
      extractions.push({
        repo: cluster.repo,
        language: cluster.language,
        observations: [],
      })
    }
  }

  const totalObs = extractions.reduce((sum, ext) => sum + ext.observations.length, 0)
  if (totalObs > 0) {
    saveExtractions(cachePath, extractions)
  }

  return { extractions, fromCache: false, skippedClusters }
}

import { existsSync, rmSync } from 'node:fs'
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
import { clusterKey, findDeltaClusters } from '../sample/delta.js'
import { buildExtractPrompt } from './build-prompt.js'
import {
  alignExtractionsToClusters,
  extractionKey,
  extractionsDiffer,
  mergeExtractions,
} from './merge.js'
import { EXTRACT_SYSTEM } from './prompt.js'

export type ExtractResult = {
  extractions: ClusterExtraction[]
  fromCache: boolean
  skippedClusters: number
  deltaClusterCount: number
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

async function extractClusterBatch(
  clusters: SampledCluster[],
  llm: LlmConfig,
): Promise<{ extractions: ClusterExtraction[]; skippedClusters: number }> {
  const extractions: ClusterExtraction[] = []
  let skippedClusters = 0

  for (const cluster of clusters) {
    try {
      const data = await completeJson(llm, EXTRACT_SYSTEM, buildExtractPrompt(cluster))
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

  return { extractions, skippedClusters }
}

function finalizeExtractions(
  repoCacheDir: string,
  cachePath: string,
  extractions: ClusterExtraction[],
  clusters: SampledCluster[],
  cached: ClusterExtraction[] | undefined,
): { extractions: ClusterExtraction[]; fromCache: boolean } {
  const aligned = alignExtractionsToClusters(extractions, clusters)
  const changed = cached ? extractionsDiffer(cached, aligned) : aligned.length > 0

  if (!changed) {
    return { extractions: aligned, fromCache: true }
  }

  const totalObs = aligned.reduce((sum, ext) => sum + ext.observations.length, 0)
  if (totalObs > 0) {
    saveExtractions(cachePath, aligned)
  } else if (existsSync(cachePath)) {
    rmSync(cachePath, { force: true })
    invalidateCompileCache(repoCacheDir)
  }

  return { extractions: aligned, fromCache: false }
}

export async function extractClusters(
  clusters: SampledCluster[],
  config: StylectConfig,
  opts: {
    slug: string
    newCommitCount: number
    llm: LlmConfig
    previousClusters?: SampledCluster[]
  },
): Promise<ExtractResult> {
  const repoCacheDir = join(config.cacheDir, opts.slug)
  const cachePath = extractionsPath(repoCacheDir)
  const deltaClusters = opts.previousClusters
    ? findDeltaClusters(opts.previousClusters, clusters)
    : clusters

  if (shouldUseLlmCache(config.fresh, cacheFileExists(cachePath), opts.newCommitCount)) {
    const cached = loadExtractions(cachePath)
    const { extractions, fromCache } = finalizeExtractions(
      repoCacheDir,
      cachePath,
      cached,
      clusters,
      cached,
    )
    return {
      extractions,
      fromCache,
      skippedClusters: 0,
      deltaClusterCount: 0,
    }
  }

  if (opts.newCommitCount > 0 && deltaClusters.length === 0 && cacheFileExists(cachePath)) {
    const cached = loadExtractions(cachePath)
    const { extractions, fromCache } = finalizeExtractions(
      repoCacheDir,
      cachePath,
      cached,
      clusters,
      cached,
    )
    return {
      extractions,
      fromCache,
      skippedClusters: 0,
      deltaClusterCount: 0,
    }
  }

  invalidateCompileCache(repoCacheDir)

  const previousExtractions = cacheFileExists(cachePath) ? loadExtractions(cachePath) : []
  const clustersToExtract =
    config.fresh || previousExtractions.length === 0 ? clusters : deltaClusters

  const { extractions: freshExtractions, skippedClusters } = await extractClusterBatch(
    clustersToExtract,
    opts.llm,
  )

  const merged =
    config.fresh || previousExtractions.length === 0
      ? freshExtractions
      : mergeExtractions(previousExtractions, freshExtractions)

  const { extractions, fromCache } = finalizeExtractions(
    repoCacheDir,
    cachePath,
    merged,
    clusters,
    previousExtractions.length > 0
      ? alignExtractionsToClusters(previousExtractions, clusters)
      : undefined,
  )

  return {
    extractions,
    fromCache,
    skippedClusters,
    deltaClusterCount: deltaClusters.length,
  }
}

export function deltaExtractions(
  extractions: ClusterExtraction[],
  previousExtractions: ClusterExtraction[],
  deltaClusters: SampledCluster[],
): ClusterExtraction[] {
  const deltaKeys = new Set(deltaClusters.map((cluster) => clusterKey(cluster)))
  const previousKeys = new Set(previousExtractions.map((extraction) => extractionKey(extraction)))

  return extractions.filter((extraction) => {
    const key = extractionKey(extraction)
    return deltaKeys.has(key) || !previousKeys.has(key)
  })
}

import type { SampledCluster } from '../models/cluster.js'
import type { ClusterExtraction } from '../models/extraction.js'
import { serializeClusterExtraction } from '../models/serialize-llm.js'
import { clusterKey, repoLanguageKey } from '../sample/delta.js'

export function extractionKey(extraction: ClusterExtraction): string {
  return repoLanguageKey(extraction.repo, extraction.language)
}

function extractionFingerprint(extraction: ClusterExtraction): string {
  return JSON.stringify(serializeClusterExtraction(extraction))
}

export function alignExtractionsToClusters(
  extractions: ClusterExtraction[],
  clusters: SampledCluster[],
): ClusterExtraction[] {
  const currentKeys = new Set(clusters.map((cluster) => clusterKey(cluster)))
  return extractions.filter((extraction) => currentKeys.has(extractionKey(extraction)))
}

export function extractionsDiffer(
  before: ClusterExtraction[],
  after: ClusterExtraction[],
): boolean {
  if (before.length !== after.length) {
    return true
  }

  const beforeByKey = new Map(
    before.map((extraction) => [extractionKey(extraction), extractionFingerprint(extraction)]),
  )
  for (const extraction of after) {
    const key = extractionKey(extraction)
    const previous = beforeByKey.get(key)
    if (previous === undefined || previous !== extractionFingerprint(extraction)) {
      return true
    }
  }

  return false
}

export function mergeExtractions(
  previous: ClusterExtraction[],
  updated: ClusterExtraction[],
): ClusterExtraction[] {
  const byKey = new Map<string, ClusterExtraction>()

  for (const extraction of previous) {
    byKey.set(extractionKey(extraction), extraction)
  }
  for (const extraction of updated) {
    byKey.set(extractionKey(extraction), extraction)
  }

  return [...byKey.values()].sort((left, right) => {
    const repoCompare = left.repo.localeCompare(right.repo)
    return repoCompare !== 0 ? repoCompare : left.language.localeCompare(right.language)
  })
}

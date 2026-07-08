import type { SampledCluster } from '../models/cluster.js'

export function repoLanguageKey(repo: string, language: string): string {
  return `${repo}\0${language}`
}

export function clusterKey(cluster: SampledCluster): string {
  return repoLanguageKey(cluster.repo, cluster.language)
}

export function findDeltaClusters(
  previous: SampledCluster[],
  current: SampledCluster[],
): SampledCluster[] {
  const previousByKey = new Map(previous.map((cluster) => [clusterKey(cluster), cluster]))
  const delta: SampledCluster[] = []

  for (const cluster of current) {
    const previousCluster = previousByKey.get(clusterKey(cluster))
    if (!previousCluster) {
      delta.push(cluster)
      continue
    }

    const previousShas = new Set(previousCluster.commits.map((commit) => commit.sha))
    const changed =
      cluster.commits.length !== previousCluster.commits.length ||
      cluster.commits.some((commit) => !previousShas.has(commit.sha))

    if (changed) {
      delta.push(cluster)
    }
  }

  return delta
}

export function findRemovedClusterKeys(
  previous: SampledCluster[],
  current: SampledCluster[],
): Set<string> {
  const currentKeys = new Set(current.map((cluster) => clusterKey(cluster)))
  const removed = new Set<string>()

  for (const cluster of previous) {
    const key = clusterKey(cluster)
    if (!currentKeys.has(key)) {
      removed.add(key)
    }
  }

  return removed
}

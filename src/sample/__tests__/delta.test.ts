import { describe, expect, it } from 'vitest'

import type { SampledCluster } from '../../models/cluster.js'
import { findDeltaClusters, findRemovedClusterKeys } from '../delta.js'

const baseCommit = {
  sha: 'abc',
  repo: 'owner/repo',
  message: 'init',
  author: 'dev',
  authoredAt: '2024-01-01T00:00:00.000Z',
  additions: 1,
  deletions: 0,
  languages: ['TypeScript'],
  files: [],
}

function cluster(sha: string, language = 'TypeScript'): SampledCluster {
  return {
    repo: 'owner/repo',
    language,
    totalInGroup: 1,
    commits: [{ ...baseCommit, sha }],
  }
}

describe('findDeltaClusters', () => {
  it('returns all clusters when previous is empty', () => {
    const current = [cluster('abc'), cluster('def', 'Ruby')]
    expect(findDeltaClusters([], current)).toEqual(current)
  })

  it('returns only clusters with changed sampled commits', () => {
    const previous = [cluster('abc')]
    const current = [cluster('abc'), cluster('def')]
    expect(findDeltaClusters(previous, current)).toEqual([cluster('def')])
  })

  it('detects changed representative commits in an existing cluster', () => {
    const previous = [cluster('abc')]
    const current = [cluster('def')]
    expect(findDeltaClusters(previous, current)).toEqual([cluster('def')])
  })

  it('returns empty when sampled clusters are unchanged', () => {
    const previous = [cluster('abc')]
    const current = [cluster('abc')]
    expect(findDeltaClusters(previous, current)).toEqual([])
  })
})

describe('findRemovedClusterKeys', () => {
  it('returns keys present in previous but not in current', () => {
    const previous = [cluster('abc'), cluster('def', 'Ruby')]
    const current = [cluster('abc')]
    const removed = findRemovedClusterKeys(previous, current)
    expect(removed.has('owner/repo\0Ruby')).toBe(true)
    expect(removed.has('owner/repo\0TypeScript')).toBe(false)
  })
})

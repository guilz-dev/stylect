import { describe, expect, it } from 'vitest'

import type { RawCommit } from '../commit.js'
import {
  deserializeRawCommit,
  deserializeSampledCluster,
  serializeRawCommit,
  serializeSampledCluster,
} from '../serialize.js'

const commit: RawCommit = {
  sha: 'abc123',
  repo: 'owner/name',
  message: 'fix: example',
  author: 'dev-user',
  authoredAt: '2024-06-01T12:00:00.000Z',
  additions: 10,
  deletions: 2,
  files: [
    {
      filename: 'src/app.ts',
      status: 'modified',
      additions: 10,
      deletions: 2,
      patch: '@@',
    },
  ],
  languages: ['TypeScript'],
}

describe('serialize round-trip', () => {
  it('serializes RawCommit to snake_case', () => {
    const serialized = serializeRawCommit(commit)
    expect(serialized.authored_at).toBe(commit.authoredAt)
    expect(serialized).not.toHaveProperty('authoredAt')
  })

  it('round-trips RawCommit', () => {
    expect(deserializeRawCommit(serializeRawCommit(commit))).toEqual(commit)
  })

  it('round-trips SampledCluster', () => {
    const cluster = {
      repo: 'owner/name',
      language: 'TypeScript',
      commits: [commit],
      totalInGroup: 12,
    }
    expect(deserializeSampledCluster(serializeSampledCluster(cluster))).toEqual(cluster)
  })
})

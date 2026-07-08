import { describe, expect, it } from 'vitest'
import type { SampledCluster } from '../../models/cluster.js'
import { buildExtractPrompt } from '../build-prompt.js'

const cluster: SampledCluster = {
  repo: 'owner/repo',
  language: 'TypeScript',
  totalInGroup: 3,
  commits: [
    {
      sha: 'abc123def456',
      repo: 'owner/repo',
      message: 'feat: add widget',
      author: 'dev',
      authoredAt: '2024-06-01T12:00:00Z',
      additions: 10,
      deletions: 2,
      languages: ['TypeScript'],
      files: [
        {
          filename: 'src/widget.ts',
          status: 'modified',
          additions: 10,
          deletions: 2,
          patch: 'diff content',
        },
      ],
    },
  ],
}

describe('buildExtractPrompt', () => {
  it('includes repo, language, and commit details', () => {
    const prompt = buildExtractPrompt(cluster)
    expect(prompt).toContain('Repository: owner/repo')
    expect(prompt).toContain('Language: TypeScript')
    expect(prompt).toContain('abc123de')
    expect(prompt).toContain('feat: add widget')
    expect(prompt).toContain('src/widget.ts')
  })
})

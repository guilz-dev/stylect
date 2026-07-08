import { describe, expect, it } from 'vitest'

import type { RawCommit } from '../../models/commit.js'
import { inferLanguagesFromCommits, languageFromFilename } from '../language.js'

describe('languageFromFilename', () => {
  it('maps common extensions', () => {
    expect(languageFromFilename('src/app.tsx')).toBe('TypeScript')
    expect(languageFromFilename('lib/user.rb')).toBe('Ruby')
  })

  it('returns undefined for unknown extensions', () => {
    expect(languageFromFilename('README')).toBeUndefined()
  })
})

describe('inferLanguagesFromCommits', () => {
  it('collects languages from changed files', () => {
    const commits: RawCommit[] = [
      {
        sha: '1',
        repo: 'o/r',
        message: 'x',
        author: 'a',
        authoredAt: '2024-01-01T00:00:00.000Z',
        additions: 1,
        deletions: 0,
        languages: [],
        files: [
          { filename: 'a.rb', status: 'modified', additions: 1, deletions: 0 },
          { filename: 'b.ts', status: 'modified', additions: 1, deletions: 0 },
        ],
      },
    ]

    expect(inferLanguagesFromCommits(commits)).toEqual(['Ruby', 'TypeScript'])
  })
})

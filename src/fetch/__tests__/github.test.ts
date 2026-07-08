import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultConfig } from '../../config.js'
import { fetchCommitsFromGitHub } from '../github.js'

const summary = {
  sha: 'abc123',
  parents: [{ sha: 'parent' }],
  commit: {
    message: 'feat: add file',
    author: { date: '2024-06-01T12:00:00.000Z', name: 'dev-user' },
  },
  author: { login: 'dev-user' },
}

const detail = {
  stats: { additions: 5, deletions: 1 },
  files: [
    {
      filename: 'src/app.ts',
      status: 'modified',
      additions: 5,
      deletions: 1,
      patch: '@@ -1 +2 @@\n+line\n',
    },
    {
      filename: '.env',
      status: 'modified',
      additions: 1,
      deletions: 0,
      patch: 'SECRET=1\n',
    },
  ],
}

describe('fetchCommitsFromGitHub', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches commits with author filter and excludes sensitive files', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/commits?')) {
        return new Response(JSON.stringify([summary]), { status: 200 })
      }
      if (url.includes('/languages')) {
        return new Response(JSON.stringify({ TypeScript: 100 }), { status: 200 })
      }
      if (url.includes('/commits/abc123')) {
        return new Response(JSON.stringify(detail), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchCommitsFromGitHub(
      'owner/repo',
      defaultConfig({ author: 'dev-user', githubToken: 'token' }),
      { perRepoLimit: 10 },
    )

    expect(result.commits).toHaveLength(1)
    expect(result.commits[0]?.author).toBe('dev-user')
    expect(result.commits[0]?.files).toHaveLength(1)
    expect(result.commits[0]?.files[0]?.filename).toBe('src/app.ts')
    expect(result.languageSource).toBe('github')
    expect(result.commits[0]?.languages).toEqual(['TypeScript'])
  })
})

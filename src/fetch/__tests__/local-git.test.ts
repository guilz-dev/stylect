import { afterEach, describe, expect, it } from 'vitest'

import { defaultConfig } from '../../config.js'
import {
  cleanupTempDirs,
  commitFile,
  createTempGitRepo,
  runGit,
} from '../../test-helpers/git-repo.js'
import { fetchCommitsFromLocalGit } from '../local-git.js'

afterEach(() => {
  cleanupTempDirs()
})

function createRepoWithAuthors(): string {
  const dir = createTempGitRepo('stylect-local-git-', 'dev-user')
  commitFile(dir, 'dev-user', 'one.rb', 'class One; end\n', 'kaz commit')
  commitFile(dir, 'other-dev', 'two.rb', 'class Two; end\n', 'other commit')
  return dir
}

describe('fetchCommitsFromLocalGit', () => {
  it('filters commits by author', async () => {
    const repoPath = createRepoWithAuthors()
    const config = defaultConfig({ author: 'dev-user' })
    const result = await fetchCommitsFromLocalGit('owner/repo', repoPath, config, {
      perRepoLimit: 20,
    })

    expect(result.commits).toHaveLength(1)
    expect(result.commits[0]?.author).toBe('dev-user')
    expect(result.commits[0]?.message).toBe('kaz commit')
  })

  it('attaches extension-derived languages when no token is available', async () => {
    const repoPath = createRepoWithAuthors()
    const config = defaultConfig({ author: 'dev-user' })
    const result = await fetchCommitsFromLocalGit('owner/repo', repoPath, config, {
      perRepoLimit: 20,
    })

    expect(result.languageSource).toBe('extensions')
    expect(result.commits[0]?.languages).toContain('Ruby')
  })

  it('preserves renamed files using the new path and renamed status', async () => {
    const repoPath = createTempGitRepo('stylect-local-git-rename-', 'dev-user')
    commitFile(repoPath, 'dev-user', 'old.ts', 'export const before = true\n', 'before rename')

    runGit(repoPath, ['mv', 'old.ts', 'new.ts'])
    runGit(repoPath, ['commit', '-m', 'rename file'])

    const config = defaultConfig({ author: 'dev-user' })
    const result = await fetchCommitsFromLocalGit('owner/repo', repoPath, config, {
      perRepoLimit: 20,
    })

    const renamedCommit = result.commits.find((commit) => commit.message === 'rename file')
    expect(renamedCommit?.files).toEqual([
      {
        filename: 'new.ts',
        status: 'renamed',
        additions: 0,
        deletions: 0,
        patch: expect.stringContaining('rename to new.ts'),
      },
    ])
  })
})

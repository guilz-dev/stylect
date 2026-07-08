import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { defaultConfig } from '../../config.js'
import { ensureParentDir, saveCommits } from '../../fetch/cache.js'
import type { RawCommit } from '../../models/commit.js'
import { runFetchPipeline } from '../fetch-stage.js'
import { runSamplePipeline } from '../sample-stage.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeCommit(sha: string): RawCommit {
  return {
    sha,
    repo: 'owner/repo',
    message: sha,
    author: 'dev-user',
    authoredAt: '2024-06-01T12:00:00.000Z',
    additions: 5,
    deletions: 0,
    files: [{ filename: 'src/app.ts', status: 'modified', additions: 5, deletions: 0 }],
    languages: ['TypeScript'],
  }
}

function runGit(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stylect-stage-'))
  tempDirs.push(dir)
  runGit(dir, ['init'])
  runGit(dir, ['config', 'user.email', 'dev-user@example.com'])
  runGit(dir, ['config', 'user.name', 'dev-user'])
  execFileSync('bash', ['-c', "echo 'export const x = 1' > app.ts"], { cwd: dir })
  runGit(dir, ['add', 'app.ts'])
  runGit(dir, ['commit', '-m', 'feat: add app'])
  return dir
}

describe('runFetchPipeline', () => {
  it('fetches commits into cache', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-fetch-cache-'))
    tempDirs.push(cacheDir)
    const repoPath = createTempRepo()
    const config = defaultConfig({
      author: 'dev-user',
      repos: ['owner/repo'],
      repoPaths: [repoPath],
      cacheDir,
      source: 'local',
    })

    await runFetchPipeline(config)

    const commitsPath = join(cacheDir, 'owner__repo', 'commits.jsonl')
    expect(existsSync(commitsPath)).toBe(true)
    expect(existsSync(join(cacheDir, 'owner__repo', 'meta.json'))).toBe(true)
  })
})

describe('runSamplePipeline', () => {
  it('samples clusters from cached commits', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-sample-cache-'))
    tempDirs.push(cacheDir)
    const repoCacheDir = join(cacheDir, 'owner__repo')
    const commitsPath = join(repoCacheDir, 'commits.jsonl')
    ensureParentDir(commitsPath)
    saveCommits(commitsPath, [makeCommit('abc123')])

    const config = defaultConfig({
      repos: ['owner/repo'],
      cacheDir,
      samplesPerGroup: 5,
      fresh: true,
    })

    await runSamplePipeline(config)

    expect(existsSync(join(repoCacheDir, 'samples.json'))).toBe(true)
  })

  it('throws when commits cache is missing', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'stylect-sample-missing-'))
    tempDirs.push(cacheDir)
    const config = defaultConfig({
      repos: ['owner/repo'],
      cacheDir,
    })

    await expect(runSamplePipeline(config)).rejects.toThrow(/No cached commits/)
  })
})

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { RawCommit } from '../../models/commit.js'
import {
  assertCacheAuthor,
  latestAuthoredAt,
  loadCommits,
  loadMeta,
  mergeCommits,
  saveCommits,
  saveMeta,
} from '../cache.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeCommit(sha: string, authoredAt: string): RawCommit {
  return {
    sha,
    repo: 'owner/repo',
    message: sha,
    author: 'author',
    authoredAt,
    additions: 1,
    deletions: 0,
    files: [],
    languages: ['TypeScript'],
  }
}

describe('cache', () => {
  it('writes snake_case JSONL commits', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-cache-'))
    tempDirs.push(dir)
    const path = join(dir, 'commits.jsonl')
    const commit = makeCommit('abc', '2024-01-02T00:00:00.000Z')

    saveCommits(path, [commit])
    const line = readFileSync(path, 'utf8').trim()
    const parsed = JSON.parse(line) as Record<string, unknown>

    expect(parsed.authored_at).toBe('2024-01-02T00:00:00.000Z')
    expect(loadCommits(path)).toEqual([commit])
  })

  it('merges commits without duplicates', () => {
    const existing = [makeCommit('a', '2024-01-01T00:00:00.000Z')]
    const incoming = [
      makeCommit('a', '2024-01-01T00:00:00.000Z'),
      makeCommit('b', '2024-01-02T00:00:00.000Z'),
    ]
    const merged = mergeCommits(existing, incoming)
    expect(merged.map((commit) => commit.sha)).toEqual(['a', 'b'])
  })

  it('finds latest authoredAt', () => {
    const commits = [
      makeCommit('a', '2024-01-01T00:00:00.000Z'),
      makeCommit('b', '2024-01-03T00:00:00.000Z'),
    ]
    expect(latestAuthoredAt(commits)).toBe('2024-01-03T00:00:00.000Z')
  })

  it('rejects mismatched cache author', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stylect-cache-'))
    tempDirs.push(dir)
    const metaPath = join(dir, 'meta.json')
    saveMeta(metaPath, {
      last_fetch_at: '2024-01-01T00:00:00.000Z',
      source: 'local-git',
      author: 'alice',
      language_source: 'extensions',
    })

    expect(() => assertCacheAuthor(loadMeta(metaPath), 'bob', 'owner/repo')).toThrow(
      /Re-run with --fresh/,
    )
  })
})

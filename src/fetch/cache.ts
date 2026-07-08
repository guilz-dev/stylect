import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SampledCluster } from '../models/cluster.js'
import type { RawCommit } from '../models/commit.js'
import type { LanguageSource } from '../models/language-source.js'
import {
  deserializeRawCommit,
  deserializeSampledCluster,
  serializeRawCommit,
  serializeSampledCluster,
} from '../models/serialize.js'

export function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
}

export function loadCommits(path: string): RawCommit[] {
  const content = readFileSync(path, 'utf8')
  const commits: RawCommit[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    commits.push(deserializeRawCommit(JSON.parse(trimmed)))
  }
  return commits
}

export function saveCommits(path: string, commits: RawCommit[]): void {
  ensureParentDir(path)
  const body = commits.map((commit) => JSON.stringify(serializeRawCommit(commit))).join('\n')
  writeFileSync(path, body.length > 0 ? `${body}\n` : '', 'utf8')
}

export function loadSamples(path: string): SampledCluster[] {
  const content = readFileSync(path, 'utf8')
  const data = JSON.parse(content) as unknown[]
  return data.map((entry) => deserializeSampledCluster(entry as never))
}

export function saveSamples(path: string, clusters: SampledCluster[]): void {
  ensureParentDir(path)
  const serialized = clusters.map(serializeSampledCluster)
  writeFileSync(path, `${JSON.stringify(serialized, null, 2)}\n`, 'utf8')
}

export type CacheMeta = {
  last_fetch_at: string
  source: 'local-git' | 'github'
  author: string
  language_source: LanguageSource
  source_path?: string
}

export function saveMeta(path: string, meta: CacheMeta): void {
  ensureParentDir(path)
  writeFileSync(path, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
}

export function latestAuthoredAt(commits: RawCommit[]): string | undefined {
  if (commits.length === 0) {
    return undefined
  }
  let latest = commits[0]?.authoredAt
  if (!latest) {
    return undefined
  }
  for (const commit of commits.slice(1)) {
    if (new Date(commit.authoredAt) > new Date(latest)) {
      latest = commit.authoredAt
    }
  }
  return latest
}

export function mergeCommits(existing: RawCommit[], incoming: RawCommit[]): RawCommit[] {
  const seen = new Set(existing.map((commit) => commit.sha))
  const merged = [...existing]
  for (const commit of incoming) {
    if (!seen.has(commit.sha)) {
      merged.push(commit)
      seen.add(commit.sha)
    }
  }
  return merged
}

export function loadMeta(path: string): CacheMeta | undefined {
  if (!existsSync(path)) {
    return undefined
  }
  return JSON.parse(readFileSync(path, 'utf8')) as CacheMeta
}

export function assertCacheAuthor(meta: CacheMeta | undefined, author: string, repo: string): void {
  if (meta && meta.author !== author) {
    throw new Error(
      `Cache for ${repo} was built for author "${meta.author}", but --author is "${author}". Re-run with --fresh.`,
    )
  }
}

export function cachedLanguages(commits: RawCommit[]): string[] | undefined {
  for (const commit of commits) {
    if (commit.languages.length > 0) {
      return commit.languages
    }
  }
  return undefined
}

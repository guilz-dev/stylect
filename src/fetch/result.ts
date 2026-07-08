import type { FetchResult } from '../models/cluster.js'
import type { RawCommit } from '../models/commit.js'
import type { LanguageSource } from '../models/language-source.js'
import type { CacheMeta } from './cache.js'
import { saveCommits, saveMeta } from './cache.js'
import type { ResolvedSource } from './source.js'
import { sourcePath } from './source.js'

export function buildFetchResult(
  source: ResolvedSource,
  allCommits: RawCommit[],
  newCommits: RawCommit[],
  languageSource: LanguageSource,
  isIncremental: boolean,
): FetchResult {
  return {
    allCommits,
    newCommits,
    isIncremental,
    source: source.kind,
    sourcePath: sourcePath(source),
    languageSource,
  }
}

export function persistFetchResult(
  paths: { commitsPath: string; metaPath: string },
  source: ResolvedSource,
  meta: Pick<CacheMeta, 'author' | 'language_source'>,
  commits: RawCommit[],
): void {
  saveCommits(paths.commitsPath, commits)
  saveMeta(paths.metaPath, {
    last_fetch_at: new Date().toISOString(),
    source: source.kind,
    author: meta.author,
    language_source: meta.language_source,
    ...(source.kind === 'local-git' ? { source_path: source.path } : {}),
  })
}

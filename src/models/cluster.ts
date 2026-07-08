import type { RawCommit } from './commit.js'
import type { LanguageSource } from './language-source.js'

export type { LanguageSource } from './language-source.js'

export type SampledCluster = {
  repo: string
  language: string
  commits: RawCommit[]
  totalInGroup: number
}

export type FetchResult = {
  allCommits: RawCommit[]
  newCommits: RawCommit[]
  isIncremental: boolean
  source: 'local-git' | 'github'
  sourcePath?: string
  languageSource: LanguageSource
}

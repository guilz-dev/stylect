import type { RawCommit } from '../models/commit.js'
import type { LanguageSource } from '../models/language-source.js'

export type KnownLanguages = {
  languages: string[]
  source: LanguageSource
}

export type FetchCommitsOptions = {
  since?: string
  perRepoLimit: number
  knownLanguages?: KnownLanguages
}

export type FetchCommitsResult = {
  commits: RawCommit[]
  languageSource: LanguageSource
}

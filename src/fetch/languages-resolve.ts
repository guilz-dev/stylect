import type { StylectConfig } from '../config.js'
import type { RawCommit } from '../models/commit.js'
import type { LanguageSource } from '../models/language-source.js'
import { inferLanguagesFromCommits } from '../util/language.js'
import { fetchRepoLanguages } from './languages.js'
import type { KnownLanguages } from './types.js'

export async function resolveRepoLanguages(
  repo: string,
  config: StylectConfig,
  commits: RawCommit[],
  knownLanguages?: KnownLanguages,
): Promise<{ languages: string[]; source: LanguageSource }> {
  if (config.githubToken) {
    const fromGitHub = await fetchRepoLanguages(repo, config.githubToken)
    if (fromGitHub.length > 0) {
      return { languages: fromGitHub, source: 'github' }
    }
  }

  if (knownLanguages && knownLanguages.languages.length > 0) {
    return knownLanguages
  }

  const fromExtensions = inferLanguagesFromCommits(commits)
  if (fromExtensions.length > 0) {
    return { languages: fromExtensions, source: 'extensions' }
  }

  return { languages: ['unknown'], source: 'unknown' }
}

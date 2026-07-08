import type { StylectConfig } from '../config.js'
import { resolveFetchSource } from '../fetch/source.js'
import { resolveRepoPath } from './repo-path.js'

export function needsGitHubToken(config: StylectConfig): boolean {
  if (config.source === 'github') {
    return true
  }
  if (config.source === 'auto') {
    return config.repos.some((repo) => resolveFetchSource(config, repo).kind === 'github')
  }
  return false
}

export function validateRunConfig(config: StylectConfig): void {
  if (config.plan) {
    return
  }

  if (config.repoPaths.length > config.repos.length) {
    throw new Error('More --repo-path values than --repo values')
  }

  if (config.source === 'local') {
    const unresolved = config.repos.filter((repo) => !resolveRepoPath(config, repo))
    if (unresolved.length > 0) {
      throw new Error(
        `No local clone found for: ${unresolved.join(', ')}. Pass --repo-path or set REPO_SEARCH_PATHS.`,
      )
    }
  }
}

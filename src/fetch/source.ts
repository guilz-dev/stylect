import type { StylectConfig } from '../config.js'
import { resolveRepoPath } from '../util/repo-path.js'

export type ResolvedSource = { kind: 'local-git'; path: string } | { kind: 'github' }

export function resolveFetchSource(config: StylectConfig, repo: string): ResolvedSource {
  if (config.source === 'github') {
    return { kind: 'github' }
  }

  const localPath = resolveRepoPath(config, repo)
  if (config.source === 'local') {
    if (!localPath) {
      throw new Error(
        `No local clone found for ${repo}. Pass --repo-path or run from the repository directory.`,
      )
    }
    return { kind: 'local-git', path: localPath }
  }

  if (localPath) {
    return { kind: 'local-git', path: localPath }
  }

  return { kind: 'github' }
}

export function sourcePath(source: ResolvedSource): string | undefined {
  return source.kind === 'local-git' ? source.path : undefined
}

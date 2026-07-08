import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { StylectConfig } from '../config.js'

export function repoToSlug(repo: string): string {
  return repo.replace('/', '__')
}

export function perRepoLimit(config: StylectConfig): number {
  return Math.max(1, Math.floor(config.maxCommits / config.repos.length))
}

export function repoCacheDir(config: StylectConfig, repo: string): string {
  return join(config.cacheDir, repoToSlug(repo))
}

export function resolveRepoPath(config: StylectConfig, repo: string): string | undefined {
  const repoIndex = config.repos.indexOf(repo)
  if (repoIndex >= 0) {
    const explicit = config.repoPaths[repoIndex]
    if (explicit && isGitRepo(explicit)) {
      return explicit
    }
  }

  if (isGitRepo(process.cwd()) && matchesOrigin(process.cwd(), repo)) {
    return process.cwd()
  }

  const searchPaths = (process.env.REPO_SEARCH_PATHS ?? '')
    .split(':')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const repoName = repo.split('/').pop() ?? repo
  for (const base of searchPaths) {
    const candidate = join(base, repoName)
    if (isGitRepo(candidate) && matchesOrigin(candidate, repo)) {
      return candidate
    }
  }

  return undefined
}

function isGitRepo(path: string): boolean {
  return existsSync(join(path, '.git'))
}

function matchesOrigin(repoPath: string, repo: string): boolean {
  try {
    const output = execFileSync('git', ['-C', repoPath, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return remoteMatchesRepo(output, repo)
  } catch {
    return false
  }
}

function remoteMatchesRepo(remote: string, repo: string): boolean {
  const normalized = remote
    .replace(/\.git$/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')

  return (
    normalized.endsWith(`/${repo}`) ||
    normalized.endsWith(repo) ||
    normalized.includes(`github.com/${repo}`)
  )
}

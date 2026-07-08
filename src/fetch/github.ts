import type { StylectConfig } from '../config.js'
import type { CommitFile, CommitFileStatus, RawCommit } from '../models/commit.js'
import { truncatePatch } from '../util/patch.js'
import { requireAuthor } from '../util/require-author.js'
import { isSensitivePath } from '../util/sensitive-path.js'
import { githubRequest } from './github-request.js'
import { resolveRepoLanguages } from './languages-resolve.js'
import type { FetchCommitsOptions, FetchCommitsResult } from './types.js'

type GitHubCommitSummary = {
  sha: string
  parents: Array<{ sha: string }>
  commit: {
    message: string
    author: {
      date: string
      name: string
    }
  }
  author?: {
    login?: string
  } | null
}

type GitHubCommitDetail = {
  stats?: {
    additions?: number
    deletions?: number
  }
  files?: Array<{
    filename: string
    status: string
    additions: number
    deletions: number
    patch?: string
  }>
}

export async function fetchCommitsFromGitHub(
  repo: string,
  config: StylectConfig,
  opts: FetchCommitsOptions,
): Promise<FetchCommitsResult> {
  const author = requireAuthor(config)
  if (!config.githubToken) {
    throw new Error('GitHub token required for GitHub fetch')
  }

  const token = config.githubToken
  const summaries = await listCommits(repo, config, opts, token)
  const commits: RawCommit[] = []

  for (const summary of summaries) {
    const commit = await loadCommitDetail(repo, token, summary, author)
    if (commit) {
      commits.push(commit)
    }
  }

  const languages = await resolveRepoLanguages(repo, config, commits, opts.knownLanguages)
  const annotated = commits.map((commit) => ({
    ...commit,
    languages: languages.languages,
  }))

  return {
    commits: annotated,
    languageSource: languages.source,
  }
}

async function listCommits(
  repo: string,
  config: StylectConfig,
  opts: Pick<FetchCommitsOptions, 'since' | 'perRepoLimit'>,
  token: string,
): Promise<GitHubCommitSummary[]> {
  const [owner, name] = repo.split('/')
  if (!owner || !name) {
    return []
  }

  const commits: GitHubCommitSummary[] = []
  let page = 1

  while (commits.length < opts.perRepoLimit) {
    const response = await githubRequest(token, `/repos/${owner}/${name}/commits`, {
      author: config.author,
      since: opts.since ?? config.since,
      until: config.until,
      per_page: '100',
      page: String(page),
    })

    const batch = (await response.json()) as GitHubCommitSummary[]
    if (batch.length === 0) {
      break
    }

    for (const summary of batch) {
      if (summary.parents.length > 1) {
        continue
      }
      commits.push(summary)
      if (commits.length >= opts.perRepoLimit) {
        break
      }
    }

    if (batch.length < 100) {
      break
    }
    page += 1
  }

  return commits
}

async function loadCommitDetail(
  repo: string,
  token: string,
  summary: GitHubCommitSummary,
  author: string,
): Promise<RawCommit | undefined> {
  const [owner, name] = repo.split('/')
  if (!owner || !name) {
    return undefined
  }

  const response = await githubRequest(token, `/repos/${owner}/${name}/commits/${summary.sha}`)
  const detail = (await response.json()) as GitHubCommitDetail
  const files = parseCommitFiles(detail.files ?? [])

  return {
    sha: summary.sha,
    repo,
    message: summary.commit.message,
    author: summary.author?.login ?? summary.commit.author.name ?? author,
    authoredAt: summary.commit.author.date,
    additions: detail.stats?.additions ?? 0,
    deletions: detail.stats?.deletions ?? 0,
    files,
    languages: [],
  }
}

function parseCommitFiles(files: GitHubCommitDetail['files']): CommitFile[] {
  if (!files) {
    return []
  }

  const parsed: CommitFile[] = []
  for (const file of files) {
    if (!file.filename || isSensitivePath(file.filename)) {
      continue
    }

    const entry: CommitFile = {
      filename: file.filename,
      status: normalizeStatus(file.status),
      additions: file.additions,
      deletions: file.deletions,
    }
    if (file.patch) {
      entry.patch = truncatePatch(file.patch)
    }
    parsed.push(entry)
  }

  return parsed
}

function normalizeStatus(status: string): CommitFileStatus {
  if (status === 'added' || status === 'removed' || status === 'renamed') {
    return status
  }
  return 'modified'
}

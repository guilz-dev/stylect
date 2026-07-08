import type { SampledCluster } from './cluster.js'
import type { CommitFile, CommitFileStatus, RawCommit } from './commit.js'

type SerializedCommitFile = {
  filename: string
  status: CommitFileStatus
  additions: number
  deletions: number
  patch?: string
}

type SerializedRawCommit = {
  sha: string
  repo: string
  message: string
  author: string
  authored_at: string
  additions: number
  deletions: number
  files: SerializedCommitFile[]
  languages: string[]
}

type SerializedSampledCluster = {
  repo: string
  language: string
  commits: SerializedRawCommit[]
  total_in_group: number
}

export function serializeCommitFile(file: CommitFile): SerializedCommitFile {
  return {
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    ...(file.patch !== undefined ? { patch: file.patch } : {}),
  }
}

export function deserializeCommitFile(file: SerializedCommitFile): CommitFile {
  return {
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    ...(file.patch !== undefined ? { patch: file.patch } : {}),
  }
}

export function serializeRawCommit(commit: RawCommit): SerializedRawCommit {
  return {
    sha: commit.sha,
    repo: commit.repo,
    message: commit.message,
    author: commit.author,
    authored_at: commit.authoredAt,
    additions: commit.additions,
    deletions: commit.deletions,
    files: commit.files.map(serializeCommitFile),
    languages: commit.languages,
  }
}

export function deserializeRawCommit(commit: SerializedRawCommit): RawCommit {
  return {
    sha: commit.sha,
    repo: commit.repo,
    message: commit.message,
    author: commit.author,
    authoredAt: commit.authored_at,
    additions: commit.additions,
    deletions: commit.deletions,
    files: commit.files.map(deserializeCommitFile),
    languages: commit.languages,
  }
}

export function serializeSampledCluster(cluster: SampledCluster): SerializedSampledCluster {
  return {
    repo: cluster.repo,
    language: cluster.language,
    commits: cluster.commits.map(serializeRawCommit),
    total_in_group: cluster.totalInGroup,
  }
}

export function deserializeSampledCluster(cluster: SerializedSampledCluster): SampledCluster {
  return {
    repo: cluster.repo,
    language: cluster.language,
    commits: cluster.commits.map(deserializeRawCommit),
    totalInGroup: cluster.total_in_group,
  }
}

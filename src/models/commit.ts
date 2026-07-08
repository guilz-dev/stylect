export type CommitFileStatus = 'added' | 'modified' | 'removed' | 'renamed'

export type CommitFile = {
  filename: string
  status: CommitFileStatus
  additions: number
  deletions: number
  patch?: string
}

export type RawCommit = {
  sha: string
  repo: string
  message: string
  author: string
  authoredAt: string
  additions: number
  deletions: number
  files: CommitFile[]
  languages: string[]
}

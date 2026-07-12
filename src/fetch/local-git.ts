import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { StylectConfig } from '../config.js'
import type { CommitFile, CommitFileStatus, RawCommit } from '../models/commit.js'
import { truncatePatch } from '../util/patch.js'
import { requireAuthor } from '../util/require-author.js'
import { isSensitivePath } from '../util/sensitive-path.js'
import { resolveRepoLanguages } from './languages-resolve.js'
import type { FetchCommitsOptions, FetchCommitsResult } from './types.js'

const execFileAsync = promisify(execFile)

export async function fetchCommitsFromLocalGit(
  repo: string,
  repoPath: string,
  config: StylectConfig,
  opts: FetchCommitsOptions,
): Promise<FetchCommitsResult> {
  const author = requireAuthor(config)

  const logArgs = [
    '-C',
    repoPath,
    'log',
    '--no-merges',
    `--author=${author}`,
    '-n',
    String(opts.perRepoLimit),
    '--format=%H%x09%an%x09%ae%x09%aI%x09%s',
  ]

  if (opts.since) {
    logArgs.push(`--since=${opts.since}`)
  }
  if (config.until) {
    logArgs.push(`--until=${config.until}`)
  }
  if (config.since && !opts.since) {
    logArgs.push(`--since=${config.since}`)
  }

  const { stdout: logOutput } = await execFileAsync('git', logArgs, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })

  const entries = logOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const commits: RawCommit[] = []
  for (const entry of entries) {
    const commit = await loadCommit(repo, repoPath, entry)
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

async function loadCommit(
  repo: string,
  repoPath: string,
  logLine: string,
): Promise<RawCommit | undefined> {
  const [sha, author, , authoredAt, ...messageParts] = logLine.split('\t')
  if (!sha || !author || !authoredAt) {
    return undefined
  }

  const message = messageParts.join('\t')
  const [{ stdout: numstat }, { stdout: patch }] = await Promise.all([
    execFileAsync('git', ['-C', repoPath, 'show', sha, '--format=', '--numstat'], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    }),
    execFileAsync('git', ['-C', repoPath, 'show', sha, '--format=', '-p'], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    }),
  ])

  const stats = parseNumstat(numstat)
  const patches = parsePatches(patch)
  const files = buildCommitFiles(stats, patches)

  const additions = files.reduce((sum, file) => sum + file.additions, 0)
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0)

  return {
    sha,
    repo,
    message,
    author,
    authoredAt,
    additions,
    deletions,
    files,
    languages: [],
  }
}

type FileStats = {
  filename: string
  additions: number
  deletions: number
  binary: boolean
}

function parseNumstat(output: string): FileStats[] {
  const files: FileStats[] = []
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    const [additionsRaw, deletionsRaw, ...filenameParts] = trimmed.split('\t')
    const filename = normalizeNumstatFilename(filenameParts.join('\t'))
    if (!filename || isSensitivePath(filename)) {
      continue
    }
    const binary = additionsRaw === '-' || deletionsRaw === '-'
    files.push({
      filename,
      additions: binary ? 0 : Number.parseInt(additionsRaw ?? '0', 10),
      deletions: binary ? 0 : Number.parseInt(deletionsRaw ?? '0', 10),
      binary,
    })
  }
  return files
}

function normalizeNumstatFilename(filename: string): string {
  if (!filename.includes('=>')) {
    return filename
  }

  const braceMatch = filename.match(/^(.*)\{(.+) => (.+)\}(.*)$/)
  if (braceMatch) {
    const [, prefix = '', , renamed = '', suffix = ''] = braceMatch
    return `${prefix}${renamed}${suffix}`
  }

  const renamed = filename.split(' => ')[1]
  return renamed?.trim() || filename
}

type ParsedPatch = {
  filename: string
  status: CommitFileStatus
  patch?: string
}

function parsePatches(output: string): ParsedPatch[] {
  const patches: ParsedPatch[] = []
  const chunks = output.split(/^diff --git /m).filter(Boolean)

  for (const chunk of chunks) {
    const parsed = parsePatchChunk(chunk)
    if (parsed && !isSensitivePath(parsed.filename)) {
      patches.push(parsed)
    }
  }

  return patches
}

function parsePatchChunk(chunk: string): ParsedPatch | undefined {
  const headerLine = chunk.split('\n')[0] ?? ''
  const match = headerLine.match(/^a\/(.+?) b\/(.+)$/)
  if (!match) {
    return undefined
  }

  const oldPath = match[1] ?? ''
  const newPath = match[2] ?? ''
  if (!oldPath || !newPath) {
    return undefined
  }
  let status: CommitFileStatus = 'modified'
  let filename = newPath

  if (chunk.includes('new file mode')) {
    status = 'added'
    filename = newPath
  } else if (chunk.includes('deleted file mode')) {
    status = 'removed'
    filename = oldPath
  } else if (chunk.includes('rename from') || chunk.includes('rename to')) {
    status = 'renamed'
    filename = newPath
  }

  const bodyStart = chunk.indexOf('\n')
  const body = bodyStart >= 0 ? chunk.slice(bodyStart + 1) : ''
  const patch = body.trim().length > 0 ? truncatePatch(body) : undefined

  return { filename, status, patch }
}

function buildCommitFiles(stats: FileStats[], patches: ParsedPatch[]): CommitFile[] {
  const patchByFilename = new Map(patches.map((entry) => [entry.filename, entry]))

  return stats.map((stat) => {
    const patchEntry = patchByFilename.get(stat.filename)
    const file: CommitFile = {
      filename: stat.filename,
      status: patchEntry?.status ?? 'modified',
      additions: stat.additions,
      deletions: stat.deletions,
    }
    if (!stat.binary && patchEntry?.patch) {
      file.patch = patchEntry.patch
    }
    return file
  })
}

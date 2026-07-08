import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDirs: string[] = []

export function trackTempDir(dir: string): void {
  tempDirs.push(dir)
}

export function cleanupTempDirs(): void {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function runGit(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, encoding: 'utf8' })
}

export function createTempGitRepo(prefix: string, author: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  trackTempDir(dir)
  runGit(dir, ['init'])
  runGit(dir, ['config', 'user.email', `${author}@example.com`])
  runGit(dir, ['config', 'user.name', author])
  return dir
}

export function commitFile(
  repoPath: string,
  author: string,
  filename: string,
  content: string,
  message: string,
): void {
  runGit(repoPath, ['config', 'user.email', `${author}@example.com`])
  runGit(repoPath, ['config', 'user.name', author])
  writeFileSync(join(repoPath, filename), content)
  runGit(repoPath, ['add', filename])
  runGit(repoPath, ['commit', '-m', message])
}

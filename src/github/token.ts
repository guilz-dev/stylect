import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Resolve GitHub token from env or `gh auth token`. */
export async function resolveGitHubToken(explicit?: string): Promise<string | undefined> {
  if (explicit) {
    return explicit
  }
  const fromEnv = process.env.GITHUB_TOKEN?.trim()
  if (fromEnv) {
    return fromEnv
  }
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      timeout: 10_000,
    })
    const token = stdout.trim()
    return token || undefined
  } catch {
    return undefined
  }
}

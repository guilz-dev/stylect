import { homedir } from 'node:os'
import { join } from 'node:path'

export type FetchSource = 'auto' | 'local' | 'github'

export const DEFAULT_LLM_MODEL = 'composer-2.5'

export type StylectConfig = {
  author?: string
  repos: string[]
  since?: string
  until?: string
  maxCommits: number
  samplesPerGroup: number
  outputDir: string
  cacheDir: string
  plan: boolean
  /** @deprecated Use `plan` instead */
  dryRun: boolean
  fresh: boolean
  skipLlm: boolean
  githubToken?: string
  cursorApiKey?: string
  model: string
  repoPaths: string[]
  source: FetchSource
}

export const DEFAULT_MAX_COMMITS = 2000
export const DEFAULT_SAMPLES_PER_GROUP = 20

export function defaultConfig(overrides: Partial<StylectConfig> = {}): StylectConfig {
  const home = homedir()
  return {
    repos: [],
    maxCommits: DEFAULT_MAX_COMMITS,
    samplesPerGroup: DEFAULT_SAMPLES_PER_GROUP,
    outputDir: join(process.cwd(), 'wiki'),
    cacheDir: join(home, '.stylect'),
    plan: false,
    dryRun: false,
    fresh: false,
    skipLlm: false,
    model: DEFAULT_LLM_MODEL,
    repoPaths: [],
    source: 'auto',
    ...overrides,
  }
}

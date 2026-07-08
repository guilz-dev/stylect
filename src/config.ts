import { homedir } from 'node:os'
import { join } from 'node:path'

export type FetchSource = 'auto' | 'local' | 'github'
export type OutputLanguage = 'en' | 'ja'

export const DEFAULT_LLM_MODEL = 'composer-2.5'
export const DEFAULT_OUTPUT_LANGUAGE: OutputLanguage = 'en'

export type StylectConfig = {
  author?: string
  repos: string[]
  since?: string
  until?: string
  maxCommits: number
  samplesPerGroup: number
  outputDir: string
  rulesDir: string
  cacheDir: string
  plan: boolean
  /** @deprecated Use `plan` instead */
  dryRun: boolean
  fresh: boolean
  skipLlm: boolean
  writeWiki: boolean
  writeRules: boolean
  lintFooter: boolean
  githubToken?: string
  cursorApiKey?: string
  model: string
  outputLanguage: OutputLanguage
  repoPaths: string[]
  source: FetchSource
}

export const DEFAULT_MAX_COMMITS = 2000
export const DEFAULT_SAMPLES_PER_GROUP = 20

export function parseOutputLanguage(value: string, source: string): OutputLanguage {
  if (value === 'en' || value === 'ja') {
    return value
  }
  throw new Error(`Invalid ${source} value: ${value} (expected en or ja)`)
}

function resolveOutputLanguageFromEnv(strict: boolean): OutputLanguage {
  const value = process.env.STYLECT_OUTPUT_LANG?.trim()
  if (!value) {
    return DEFAULT_OUTPUT_LANGUAGE
  }
  try {
    return parseOutputLanguage(value, 'STYLECT_OUTPUT_LANG')
  } catch (error) {
    if (!strict) {
      return DEFAULT_OUTPUT_LANGUAGE
    }
    throw error
  }
}

export function defaultConfig(
  overrides: Partial<StylectConfig> = {},
  options: { strictEnv?: boolean } = {},
): StylectConfig {
  const home = homedir()
  const strictEnv = options.strictEnv ?? true
  return {
    repos: [],
    maxCommits: DEFAULT_MAX_COMMITS,
    samplesPerGroup: DEFAULT_SAMPLES_PER_GROUP,
    outputDir: join(process.cwd(), 'wiki'),
    rulesDir: join(process.cwd(), '.cursor', 'rules'),
    cacheDir: join(home, '.stylect'),
    plan: false,
    dryRun: false,
    fresh: false,
    skipLlm: false,
    writeWiki: true,
    writeRules: true,
    lintFooter: true,
    model: DEFAULT_LLM_MODEL,
    outputLanguage: resolveOutputLanguageFromEnv(strictEnv),
    repoPaths: [],
    source: 'auto',
    ...overrides,
  }
}

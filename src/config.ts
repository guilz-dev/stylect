import { homedir } from 'node:os'
import { join } from 'node:path'

export type FetchSource = 'auto' | 'local' | 'github'
export type OutputLanguage = 'en' | 'ja'
export type LlmProvider = 'anthropic' | 'cursor' | 'openai'

export const DEFAULT_LLM_PROVIDER: LlmProvider = 'cursor'
export const DEFAULT_OUTPUT_LANGUAGE: OutputLanguage = 'en'

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: 'claude-3-5-sonnet-latest',
  cursor: 'composer-2.5',
  openai: 'gpt-4.1-mini',
}

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
  llmProvider: LlmProvider
  llmApiKey?: string
  cursorApiKey?: string
  model: string
  outputLanguage: OutputLanguage
  repoPaths: string[]
  source: FetchSource
}

export const DEFAULT_MAX_COMMITS = 2000
export const DEFAULT_SAMPLES_PER_GROUP = 20

export function defaultModelForProvider(provider: LlmProvider): string {
  return DEFAULT_MODELS[provider]
}

export function parseLlmProvider(value: string, source: string): LlmProvider {
  if (value === 'anthropic' || value === 'cursor' || value === 'openai') {
    return value
  }
  throw new Error(`Invalid ${source} value: ${value} (expected anthropic, cursor, or openai)`)
}

export function parseOutputLanguage(value: string, source: string): OutputLanguage {
  if (value === 'en' || value === 'ja') {
    return value
  }
  throw new Error(`Invalid ${source} value: ${value} (expected en or ja)`)
}

function resolveLlmProviderFromEnv(strict: boolean): LlmProvider {
  const value = process.env.STYLECT_LLM_PROVIDER?.trim()
  if (!value) {
    return DEFAULT_LLM_PROVIDER
  }
  try {
    return parseLlmProvider(value, 'STYLECT_LLM_PROVIDER')
  } catch (error) {
    if (!strict) {
      return DEFAULT_LLM_PROVIDER
    }
    throw error
  }
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
  const envLlmProvider = resolveLlmProviderFromEnv(strictEnv)
  const llmProvider = overrides.llmProvider ?? envLlmProvider
  const base: StylectConfig = {
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
    llmProvider,
    model: defaultModelForProvider(llmProvider),
    outputLanguage: resolveOutputLanguageFromEnv(strictEnv),
    repoPaths: [],
    source: 'auto',
  }

  return {
    ...base,
    ...overrides,
    llmProvider,
    model: overrides.model ?? base.model,
  }
}

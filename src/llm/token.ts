import type { LlmProvider } from '../config.js'

export function resolveCursorApiKey(explicit?: string): string | undefined {
  if (explicit) {
    return explicit
  }
  return process.env.CURSOR_API_KEY
}

export function resolveLlmApiKey(
  provider: LlmProvider,
  explicit?: string,
  legacyCursor?: string,
): string | undefined {
  if (explicit) {
    return explicit
  }

  if (provider === 'cursor') {
    return resolveCursorApiKey(legacyCursor) ?? process.env.STYLECT_LLM_API_KEY?.trim()
  }

  const providerEnv =
    provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY
  return providerEnv?.trim() || process.env.STYLECT_LLM_API_KEY?.trim()
}

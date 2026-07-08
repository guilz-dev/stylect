import { Agent } from '@cursor/sdk'

import { buildJsonRetryPrompt, parseJsonFromLlm } from './parse-json.js'

export type LlmConfig = {
  apiKey: string
  model: string
}

const DEFAULT_RETRIES = 3
const API_MAX_RETRIES = 5
const API_BASE_DELAY_MS = 2000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  return (
    message.includes('rate') ||
    message.includes('overloaded') ||
    message.includes('timeout') ||
    message.includes('503') ||
    message.includes('429') ||
    message.includes('network')
  )
}

export async function completeText(llm: LlmConfig, system: string, user: string): Promise<string> {
  const message = `${system}\n\n---\n\n${user}`
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= API_MAX_RETRIES; attempt += 1) {
    try {
      const result = await Agent.prompt(message, {
        apiKey: llm.apiKey,
        model: { id: llm.model },
        local: { cwd: process.cwd() },
      })

      if (result.status === 'error') {
        const error = new Error(result.error?.message ?? 'LLM run failed')
        if (isRetryableError(error) && attempt < API_MAX_RETRIES) {
          lastError = error
          await sleep(API_BASE_DELAY_MS * 2 ** attempt)
          continue
        }
        throw error
      }

      return result.result ?? ''
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (isRetryableError(lastError) && attempt < API_MAX_RETRIES) {
        await sleep(API_BASE_DELAY_MS * 2 ** attempt)
        continue
      }
      throw lastError
    }
  }

  throw lastError ?? new Error('LLM run failed')
}

export async function completeJson(
  llm: LlmConfig,
  system: string,
  user: string,
  retries = DEFAULT_RETRIES,
): Promise<unknown> {
  let lastError: Error | undefined
  let prompt = user

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const text = await completeText(llm, system, prompt)
    try {
      return parseJsonFromLlm(text)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt >= retries) {
        break
      }
      prompt = buildJsonRetryPrompt(user, text, lastError.message)
    }
  }

  throw lastError ?? new Error('Failed to parse LLM JSON response')
}

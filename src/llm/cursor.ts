import { Agent } from '@cursor/sdk'

import type { LlmProvider } from '../config.js'
import { buildJsonRetryPrompt, parseJsonFromLlm } from './parse-json.js'

export type LlmConfig = {
  provider: LlmProvider
  apiKey: string
  model: string
}

const DEFAULT_RETRIES = 3
const API_MAX_RETRIES = 5
const API_BASE_DELAY_MS = 2000
const ANTHROPIC_MAX_TOKENS = 8192

type ApiError = Error & { status?: number }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function asApiError(error: unknown): ApiError {
  return error instanceof Error ? error : new Error(String(error))
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined
  if (status === 408 || status === 409 || status === 429) {
    return true
  }
  if (typeof status === 'number' && status >= 500) {
    return true
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('rate') ||
    message.includes('overloaded') ||
    message.includes('timeout') ||
    message.includes('503') ||
    message.includes('529') ||
    message.includes('429') ||
    message.includes('network')
  )
}

function buildHttpError(provider: LlmProvider, status: number, payload: unknown): ApiError {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const nestedError =
    record.error && typeof record.error === 'object'
      ? (record.error as Record<string, unknown>)
      : undefined
  const message =
    (typeof nestedError?.message === 'string' && nestedError.message) ||
    (typeof record.message === 'string' && record.message) ||
    `${provider} API request failed with status ${status}`
  const error = new Error(message) as ApiError
  error.status = status
  return error
}

async function parseJsonResponse(response: Response, provider: LlmProvider): Promise<unknown> {
  const text = await response.text()
  const payload = text ? safeJsonParse(text) : undefined

  if (!response.ok) {
    throw buildHttpError(provider, response.status, payload ?? text)
  }

  if (payload === undefined) {
    throw new Error(`${provider} API returned an empty response`)
  }

  return payload
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function textFromContentParts(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part
      }
      if (!part || typeof part !== 'object') {
        return ''
      }
      const record = part as Record<string, unknown>
      if (typeof record.text === 'string') {
        return record.text
      }
      const nested = record.text
      if (
        nested &&
        typeof nested === 'object' &&
        typeof (nested as { value?: unknown }).value === 'string'
      ) {
        return (nested as { value: string }).value
      }
      return ''
    })
    .join('')
}

async function completeWithCursor(llm: LlmConfig, system: string, user: string): Promise<string> {
  const message = `${system}\n\n---\n\n${user}`
  const result = await Agent.prompt(message, {
    apiKey: llm.apiKey,
    model: { id: llm.model },
    local: { cwd: process.cwd() },
  })

  if (result.status === 'error') {
    throw new Error(result.error?.message ?? 'LLM run failed')
  }

  return result.result ?? ''
}

async function completeWithOpenAi(llm: LlmConfig, system: string, user: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: llm.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  const data = await parseJsonResponse(response, llm.provider)
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const choices = Array.isArray(record.choices) ? record.choices : []
  const first = choices[0]
  if (!first || typeof first !== 'object') {
    throw new Error('OpenAI API returned no choices')
  }
  const message =
    'message' in first && first.message && typeof first.message === 'object'
      ? (first.message as Record<string, unknown>)
      : undefined
  const text = textFromContentParts(message?.content)
  if (!text) {
    throw new Error('OpenAI API returned an empty message')
  }
  return text
}

async function completeWithAnthropic(
  llm: LlmConfig,
  system: string,
  user: string,
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': llm.apiKey,
    },
    body: JSON.stringify({
      model: llm.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system,
      messages: [
        {
          role: 'user',
          content: user,
        },
      ],
    }),
  })

  const data = await parseJsonResponse(response, llm.provider)
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const text = textFromContentParts(record.content)
  if (!text) {
    throw new Error('Anthropic API returned an empty message')
  }
  return text
}

async function completeOnce(llm: LlmConfig, system: string, user: string): Promise<string> {
  switch (llm.provider) {
    case 'anthropic':
      return completeWithAnthropic(llm, system, user)
    case 'openai':
      return completeWithOpenAi(llm, system, user)
    case 'cursor':
      return completeWithCursor(llm, system, user)
  }
}

export async function completeText(llm: LlmConfig, system: string, user: string): Promise<string> {
  let lastError: ApiError | undefined

  for (let attempt = 0; attempt <= API_MAX_RETRIES; attempt += 1) {
    try {
      return await completeOnce(llm, system, user)
    } catch (error) {
      lastError = asApiError(error)
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

import { afterEach, describe, expect, it, vi } from 'vitest'

import { completeJson, completeText } from '../cursor.js'

describe('llm client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls OpenAI chat completions with bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const text = await completeText(
      { provider: 'openai', apiKey: 'openai-key', model: 'gpt-4.1-mini' },
      'system prompt',
      'user prompt',
    )

    expect(text).toBe('{"ok":true}')
    expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer openai-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'user prompt' },
        ],
      }),
    })
  })

  it('calls Anthropic messages API with x-api-key auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          content: [{ type: 'text', text: '{"passed":true}' }],
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const text = await completeText(
      { provider: 'anthropic', apiKey: 'anthropic-key', model: 'claude-3-5-sonnet-latest' },
      'system prompt',
      'user prompt',
    )

    expect(text).toBe('{"passed":true}')
    expect(fetchMock).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': 'anthropic-key',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 8192,
        system: 'system prompt',
        messages: [
          {
            role: 'user',
            content: 'user prompt',
          },
        ],
      }),
    })
  })

  it('parses JSON responses through the OpenAI path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: '```json\n{"items":[]}\n```' } }],
          }),
      }),
    )

    const result = await completeJson(
      { provider: 'openai', apiKey: 'openai-key', model: 'gpt-4.1-mini' },
      'system prompt',
      'user prompt',
    )

    expect(result).toEqual({ items: [] })
  })
})

/** Extract JSON from markdown code fences or raw text. */
export function extractJsonText(text: string): string {
  if (text.includes('```json')) {
    const inner = text.split('```json')[1]
    return inner?.split('```')[0]?.trim() ?? text.trim()
  }
  if (text.includes('```')) {
    const inner = text.split('```')[1]
    return inner?.split('```')[0]?.trim() ?? text.trim()
  }
  return text.trim()
}

export function parseJsonFromLlm(text: string): unknown {
  const extracted = extractJsonText(text)
  return JSON.parse(extracted)
}

export function buildJsonRetryPrompt(
  originalUser: string,
  previousText: string,
  error: string,
): string {
  return [
    `Your previous response was not valid JSON (error: ${error}).`,
    'Here is what you returned:',
    '```',
    previousText.slice(0, 2000),
    '```',
    '',
    'Please return ONLY valid JSON matching the schema in your instructions.',
    'Original request:',
    '',
    originalUser,
  ].join('\n')
}

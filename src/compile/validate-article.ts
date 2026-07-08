/** Heuristic: compiled wiki body ended before a complete sentence or block. */
export function looksTruncatedArticleContent(content: string): boolean {
  const trimmed = content.trimEnd()
  if (trimmed.length === 0) {
    return true
  }

  if (trimmed.endsWith('…') || trimmed.endsWith('...')) {
    return true
  }

  if (/`[^`\n]*$/.test(trimmed) || /\[[^\]\n]*$/.test(trimmed)) {
    return true
  }

  const lastLine = trimmed.split('\n').at(-1)?.trim() ?? ''
  if (lastLine.length === 0) {
    return false
  }

  if (/^#{1,6}\s/.test(lastLine)) {
    return true
  }

  if (/^[-|]/.test(lastLine) && !lastLine.endsWith('|')) {
    return true
  }

  const lastChar = lastLine.at(-1) ?? ''
  return !/[.!?。`)」』\]>*_]/.test(lastChar)
}

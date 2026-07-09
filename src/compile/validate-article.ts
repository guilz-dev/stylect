/** Heuristic: compiled wiki body ended before a complete sentence or block. */
function hasOddCount(text: string, char: string): boolean {
  return text.split(char).length % 2 === 0
}

function hasUnbalancedBrackets(text: string): boolean {
  const opens = text.match(/\[/g)?.length ?? 0
  const closes = text.match(/\]/g)?.length ?? 0
  return opens !== closes
}

export function looksTruncatedArticleContent(content: string): boolean {
  const trimmed = content.trimEnd()
  if (trimmed.length === 0) {
    return true
  }

  if (trimmed.endsWith('…') || trimmed.endsWith('...')) {
    return true
  }

  if (hasOddCount(trimmed, '`') || hasUnbalancedBrackets(trimmed)) {
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

  if (/[.!?。`)」』\]>*_]$/.test(lastLine)) {
    return false
  }

  // Short tail lines that end mid-token are usually LLM cut-offs.
  if (lastLine.length < 48 && /[`\w]$/.test(lastLine)) {
    return true
  }

  return false
}

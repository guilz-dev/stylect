export function renderYamlFrontmatter(
  fields: Record<string, string | boolean | number | string[]>,
): string {
  const lines = ['---']
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) {
        lines.push(`  - ${item}`)
      }
    } else if (typeof value === 'string' && value.includes('\n')) {
      lines.push(`${key}: |`)
      for (const line of value.split('\n')) {
        lines.push(`  ${line}`)
      }
    } else {
      lines.push(`${key}: ${formatScalar(value)}`)
    }
  }
  lines.push('---')
  return lines.join('\n')
}

function formatScalar(value: string | boolean | number): string {
  if (typeof value === 'string') {
    if (value.includes(':') || value.includes('*') || value.includes('#')) {
      return `"${value.replace(/"/g, '\\"')}"`
    }
    return value
  }
  return String(value)
}

/** Nine style dimensions (gitstyle-compatible). Inspired by arlington-labs/gitstyle. */
export const STYLE_DIMENSIONS = [
  'code-structure',
  'naming-conventions',
  'patterns',
  'type-discipline',
  'testing',
  'comments-and-docs',
  'dependencies',
  'commit-hygiene',
  'language-idioms',
] as const

export type StyleDimension = (typeof STYLE_DIMENSIONS)[number]

const DIMENSION_SET = new Set<string>(STYLE_DIMENSIONS)

export function isStyleDimension(value: string): value is StyleDimension {
  return DIMENSION_SET.has(value)
}

export function parseStyleDimension(value: string): StyleDimension | undefined {
  return isStyleDimension(value) ? value : undefined
}

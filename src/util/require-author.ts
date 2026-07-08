import type { StylectConfig } from '../config.js'

export function requireAuthor(config: StylectConfig): string {
  if (!config.author) {
    throw new Error('--author is required in Phase 1')
  }
  return config.author
}

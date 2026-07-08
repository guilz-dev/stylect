import type { StylectConfig } from '../config.js'

export function validateFetchConfig(config: StylectConfig): void {
  if (config.repos.length === 0) {
    throw new Error('fetch requires at least one --repo owner/name')
  }
}

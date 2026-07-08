import type { StylectConfig } from '../config.js'

export function validateSampleConfig(config: StylectConfig): void {
  if (config.repos.length === 0) {
    throw new Error('sample requires at least one --repo owner/name')
  }
}

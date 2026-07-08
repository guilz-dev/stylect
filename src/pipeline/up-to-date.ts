import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { StylectConfig } from '../config.js'

export function outputArtifactsExist(config: StylectConfig): boolean {
  if (config.writeWiki) {
    if (!existsSync(join(config.outputDir, 'index.md'))) {
      return false
    }
  }

  if (!config.writeRules) {
    return true
  }

  if (!existsSync(config.rulesDir)) {
    return false
  }

  try {
    return readdirSync(config.rulesDir).some(
      (entry) => entry.startsWith('stylect-') && entry.endsWith('.mdc'),
    )
  } catch {
    return false
  }
}

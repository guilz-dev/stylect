import type { StylectConfig } from '../config.js'

export function validateWriteConfig(config: StylectConfig): void {
  if (config.repos.length === 0) {
    throw new Error('write requires at least one --repo owner/name')
  }

  if (!config.writeWiki && !config.writeRules) {
    throw new Error('write requires at least one of wiki or rules output to be enabled')
  }
}

import type { OutputLanguage } from '../config.js'

function outputLanguageRequirement(outputLanguage: OutputLanguage): string {
  if (outputLanguage === 'ja') {
    return [
      '- Write all prose in Japanese.',
      '- Keep code symbols, file paths, flags, and commit SHAs in their original form.',
    ].join('\n')
  }
  return [
    '- Write all prose in English.',
    '- Keep code symbols, file paths, flags, and commit SHAs in their original form.',
  ].join('\n')
}

export function withOutputLanguage(systemPrompt: string, outputLanguage: OutputLanguage): string {
  return `${systemPrompt}\n\nOutput language requirements:\n${outputLanguageRequirement(outputLanguage)}`
}

import type { OutputLanguage } from '../config.js'

function outputLanguageRequirement(outputLanguage: OutputLanguage): string {
  if (outputLanguage === 'ja') {
    return [
      '- Write all prose in Japanese.',
      '- Write in third person (e.g. 「この開発者は…する傾向がある」).',
      '- Do not use English boilerplate such as "The developer tends to".',
      '- Prefer Japanese article titles with an English gloss in parentheses when helpful (e.g. 「言語慣習（Language Idioms）」).',
      '- Use exact CLI flag and environment variable names from the codebase (e.g. --output-lang, STYLECT_OUTPUT_LANG).',
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

import type { WikiArticle } from '../models/article.js'

const LANGUAGE_GLOBS: Record<string, string> = {
  ruby: '**/*.{rb,rake,Gemfile,Rakefile}',
  typescript: '**/*.{ts,tsx}',
  javascript: '**/*.{js,jsx,mjs,cjs}',
  python: '**/*.{py,pyi}',
  go: '**/*.{go}',
  rust: '**/*.{rs}',
  java: '**/*.{java}',
  swift: '**/*.{swift}',
  kotlin: '**/*.{kt,kts}',
  csharp: '**/*.{cs}',
  cplusplus: '**/*.{cpp,hpp,cc,h}',
  shell: '**/*.{sh,bash,zsh}',
}

export function globsForArticle(article: WikiArticle): string {
  if (article.slug === 'testing') {
    return '**/*.{test,spec}.{ts,js,tsx,jsx,rb,py,go}'
  }

  if (article.category === 'language') {
    return LANGUAGE_GLOBS[article.slug] ?? '**/*'
  }

  return '**/*'
}

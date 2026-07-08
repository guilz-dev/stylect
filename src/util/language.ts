import type { RawCommit } from '../models/commit.js'

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  rb: 'Ruby',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
  cs: 'C#',
  cpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  c: 'C',
  h: 'C',
  hpp: 'C++',
  php: 'PHP',
  sql: 'SQL',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  yaml: 'YAML',
  yml: 'YAML',
  json: 'JSON',
  md: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  vue: 'Vue',
  svelte: 'Svelte',
  dart: 'Dart',
  scala: 'Scala',
  ex: 'Elixir',
  exs: 'Elixir',
  erl: 'Erlang',
  hs: 'Haskell',
  lua: 'Lua',
  r: 'R',
  pl: 'Perl',
  pm: 'Perl',
}

export function languageFromFilename(filename: string): string | undefined {
  const base = filename.split('/').pop() ?? filename
  const dot = base.lastIndexOf('.')
  if (dot <= 0) {
    return undefined
  }
  const ext = base.slice(dot + 1).toLowerCase()
  return EXTENSION_TO_LANGUAGE[ext]
}

export function inferLanguagesFromCommits(commits: RawCommit[]): string[] {
  const languages = new Set<string>()
  for (const commit of commits) {
    for (const file of commit.files) {
      const language = languageFromFilename(file.filename)
      if (language) {
        languages.add(language)
      }
    }
  }
  return [...languages].sort()
}

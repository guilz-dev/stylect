import type { ClusterExtraction } from '../models/extraction.js'
import type { Observation } from '../models/observation.js'
import type { StyleDimension } from '../models/style-dimension.js'
import { STYLE_DIMENSIONS } from '../models/style-dimension.js'

export function slugifyLanguage(lang: string): string {
  return lang
    .toLowerCase()
    .replace(/\//g, '-')
    .replace(/ /g, '-')
    .replace(/#/g, 'sharp')
    .replace(/\+/g, 'plus')
}

function normalizeLanguage(lang: string): string {
  const trimmed = lang.trim().replace(/\//g, '-')
  const aliases: Record<string, string> = {
    m: 'MATLAB',
    cuda: 'CUDA',
    'c++': 'C++',
    'c#': 'C#',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    'jupyter notebook': 'Jupyter Notebook',
    html: 'HTML',
    css: 'CSS',
    'html-css': 'HTML-CSS',
    shell: 'Shell',
    makefile: 'Makefile',
    markdown: 'Markdown',
    mdx: 'MDX',
    python: 'Python',
    go: 'Go',
    rust: 'Rust',
    lua: 'Lua',
    swift: 'Swift',
  }
  return aliases[trimmed.toLowerCase()] ?? trimmed
}

export type GroupedObservations = {
  byDimension: Map<StyleDimension, Observation[]>
  byLanguage: Map<string, Observation[]>
  repos: Set<string>
}

export function groupObservations(extractions: ClusterExtraction[]): GroupedObservations {
  const byDimension = new Map<StyleDimension, Observation[]>()
  const byLanguage = new Map<string, Observation[]>()
  const repos = new Set<string>()

  for (const ext of extractions) {
    repos.add(ext.repo)
    for (const obs of ext.observations) {
      const dimList = byDimension.get(obs.dimension) ?? []
      dimList.push(obs)
      byDimension.set(obs.dimension, dimList)

      if (obs.language && obs.dimension === 'language-idioms') {
        const normalized = normalizeLanguage(obs.language)
        const langList = byLanguage.get(normalized) ?? []
        langList.push(obs)
        byLanguage.set(normalized, langList)
      }
    }
  }

  return { byDimension, byLanguage, repos }
}

export function buildDimensionPrompt(
  dimension: StyleDimension,
  observations: Observation[],
  validSlugs?: string[],
): string {
  const lines = [`Dimension: ${dimension}`, `Total observations: ${observations.length}`, '']

  if (validSlugs && validSlugs.length > 0) {
    lines.push(`IMPORTANT: Only use wikilinks from this list: ${validSlugs.join(', ')}`)
    lines.push("Do NOT invent wikilinks to articles that aren't in this list.")
    lines.push('')
  }

  lines.push('Observations:')
  lines.push(formatDimensionObservationLines(observations))

  return lines.join('\n')
}

export function formatDimensionObservationLines(observations: Observation[]): string {
  const lines: string[] = []
  for (const [index, obs] of observations.entries()) {
    lines.push(`\n${index + 1}. [${Math.round(obs.confidence * 100)}% confidence]`)
    lines.push(`   Claim: ${obs.claim}`)
    lines.push(`   Evidence: ${obs.evidence.join(', ')}`)
    if (obs.language) {
      lines.push(`   Language: ${obs.language}`)
    }
  }
  return lines.join('\n')
}

export function buildLanguagePrompt(
  language: string,
  observations: Observation[],
  validSlugs?: string[],
): string {
  const lines = [`Language: ${language}`, `Total observations: ${observations.length}`, '']

  if (validSlugs && validSlugs.length > 0) {
    lines.push(`IMPORTANT: Only use wikilinks from this list: ${validSlugs.join(', ')}`)
    lines.push("Do NOT invent wikilinks to articles that aren't in this list.")
    lines.push('')
  }

  lines.push('Observations:')
  lines.push(formatLanguageObservationLines(observations))

  return lines.join('\n')
}

export function formatLanguageObservationLines(observations: Observation[]): string {
  const lines: string[] = []
  for (const [index, obs] of observations.entries()) {
    lines.push(
      `\n${index + 1}. [${Math.round(obs.confidence * 100)}% confidence] (${obs.dimension})`,
    )
    lines.push(`   Claim: ${obs.claim}`)
    lines.push(`   Evidence: ${obs.evidence.join(', ')}`)
  }
  return lines.join('\n')
}

export function validCompileSlugs(
  byDimension: Map<StyleDimension, Observation[]>,
  byLanguage: Map<string, Observation[]>,
): string[] {
  const slugs: string[] = []
  for (const dim of STYLE_DIMENSIONS) {
    if ((byDimension.get(dim)?.length ?? 0) > 0) {
      slugs.push(dim)
    }
  }
  for (const lang of [...byLanguage.keys()].sort()) {
    slugs.push(slugifyLanguage(lang))
  }
  return slugs
}

export function fixWikilinks<T extends { slug: string; wikilinks: string[]; content: string }>(
  articles: T[],
): T[] {
  const validSlugs = new Set(articles.map((article) => article.slug))

  return articles.map((article) => {
    const wikilinks = article.wikilinks.filter(
      (link) => validSlugs.has(link) && link !== article.slug,
    )

    const content = article.content.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
      const parts = inner.split('|')
      const slugPart = (parts[0] ?? '').trim()
      const display = (parts[1] ?? slugPart.replace(/-/g, ' ')).trim()
      const normalized = slugPart.toLowerCase().replace(/ /g, '-')
      if (normalized === article.slug || !validSlugs.has(normalized)) {
        return display
      }
      return parts.length > 1 ? `[[${normalized}|${display}]]` : `[[${normalized}]]`
    })

    return { ...article, wikilinks, content }
  })
}

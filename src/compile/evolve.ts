import type { WikiArticle } from '../models/article.js'
import type { ClusterExtraction } from '../models/extraction.js'
import type { Observation } from '../models/observation.js'
import type { StyleDimension } from '../models/style-dimension.js'
import { STYLE_DIMENSIONS } from '../models/style-dimension.js'
import {
  formatDimensionObservationLines,
  formatLanguageObservationLines,
  groupObservations,
  slugifyLanguage,
} from './merge.js'

export function affectedCompileSlugs(deltaExtractions: ClusterExtraction[]): Set<string> {
  const grouped = groupObservations(deltaExtractions)
  const slugs = new Set<string>()

  for (const dimension of STYLE_DIMENSIONS) {
    if ((grouped.byDimension.get(dimension)?.length ?? 0) > 0) {
      slugs.add(dimension)
    }
  }

  for (const language of grouped.byLanguage.keys()) {
    slugs.add(slugifyLanguage(language))
  }

  return slugs
}

export function buildEvolveDimensionPrompt(
  dimension: StyleDimension,
  existingArticle: WikiArticle,
  observations: Observation[],
  validSlugs?: string[],
): string {
  const lines = [
    `Dimension: ${dimension}`,
    '',
    '## Existing article',
    existingArticle.content,
    '',
    '## New observations to integrate',
    `Total observations: ${observations.length}`,
    '',
  ]

  if (validSlugs && validSlugs.length > 0) {
    lines.push(`IMPORTANT: Only use wikilinks from this list: ${validSlugs.join(', ')}`)
    lines.push("Do NOT invent wikilinks to articles that aren't in this list.")
    lines.push('')
  }

  lines.push('Observations:')
  lines.push(formatDimensionObservationLines(observations))
  lines.push('')
  lines.push(
    'Evolve the existing article. Preserve accurate content and integrate the new evidence.',
  )
  return lines.join('\n')
}

export function buildEvolveLanguagePrompt(
  language: string,
  existingArticle: WikiArticle,
  observations: Observation[],
  validSlugs?: string[],
): string {
  const lines = [
    `Language: ${language}`,
    '',
    '## Existing article',
    existingArticle.content,
    '',
    '## New observations to integrate',
    `Total observations: ${observations.length}`,
    '',
  ]

  if (validSlugs && validSlugs.length > 0) {
    lines.push(`IMPORTANT: Only use wikilinks from this list: ${validSlugs.join(', ')}`)
    lines.push("Do NOT invent wikilinks to articles that aren't in this list.")
    lines.push('')
  }

  lines.push('Observations:')
  lines.push(formatLanguageObservationLines(observations))
  lines.push('')
  lines.push(
    'Evolve the existing article. Preserve accurate content and integrate the new evidence.',
  )
  return lines.join('\n')
}

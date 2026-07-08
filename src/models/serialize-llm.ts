import type { WikiArticle } from './article.js'
import type { ClusterExtraction } from './extraction.js'
import type { LintIssue, LintReport, LintSeverity } from './lint-report.js'
import type { Observation } from './observation.js'
import { parseStyleDimension } from './style-dimension.js'

type SerializedObservation = {
  dimension: string
  claim: string
  evidence: string[]
  confidence: number
  language?: string
}

type SerializedClusterExtraction = {
  repo: string
  language: string
  observations: SerializedObservation[]
}

type SerializedWikiArticle = {
  slug: string
  title: string
  category: 'dimension' | 'language'
  confidence: number
  source_repos: string[]
  content: string
  wikilinks: string[]
}

type SerializedLintIssue = {
  article: string
  severity: LintSeverity
  message: string
  suggestion?: string
}

type SerializedLintReport = {
  issues: SerializedLintIssue[]
  passed: boolean
}

function serializeObservation(obs: Observation): SerializedObservation {
  return {
    dimension: obs.dimension,
    claim: obs.claim,
    evidence: obs.evidence,
    confidence: obs.confidence,
    ...(obs.language !== undefined ? { language: obs.language } : {}),
  }
}

function deserializeObservation(obs: SerializedObservation): Observation | undefined {
  const dimension = parseStyleDimension(obs.dimension)
  if (!dimension) {
    return undefined
  }
  return {
    dimension,
    claim: obs.claim,
    evidence: obs.evidence,
    confidence: obs.confidence,
    ...(obs.language !== undefined ? { language: obs.language } : {}),
  }
}

export function serializeClusterExtraction(ext: ClusterExtraction): SerializedClusterExtraction {
  return {
    repo: ext.repo,
    language: ext.language,
    observations: ext.observations.map(serializeObservation),
  }
}

export function deserializeClusterExtraction(ext: SerializedClusterExtraction): ClusterExtraction {
  return {
    repo: ext.repo,
    language: ext.language,
    observations: ext.observations
      .map(deserializeObservation)
      .filter((obs): obs is Observation => obs !== undefined),
  }
}

export function serializeWikiArticle(article: WikiArticle): SerializedWikiArticle {
  return {
    slug: article.slug,
    title: article.title,
    category: article.category,
    confidence: article.confidence,
    source_repos: article.sourceRepos,
    content: article.content,
    wikilinks: article.wikilinks,
  }
}

export function deserializeWikiArticle(article: SerializedWikiArticle): WikiArticle {
  return {
    slug: article.slug,
    title: article.title,
    category: article.category,
    confidence: article.confidence,
    sourceRepos: article.source_repos,
    content: article.content,
    wikilinks: article.wikilinks,
  }
}

export function serializeLintIssue(issue: LintIssue): SerializedLintIssue {
  return {
    article: issue.article,
    severity: issue.severity,
    message: issue.message,
    ...(issue.suggestion !== undefined ? { suggestion: issue.suggestion } : {}),
  }
}

export function deserializeLintIssue(issue: SerializedLintIssue): LintIssue {
  return {
    article: issue.article,
    severity: issue.severity,
    message: issue.message,
    ...(issue.suggestion !== undefined ? { suggestion: issue.suggestion } : {}),
  }
}

export function serializeLintReport(report: LintReport): SerializedLintReport {
  return {
    issues: report.issues.map(serializeLintIssue),
    passed: report.passed,
  }
}

export function deserializeLintReport(report: SerializedLintReport): LintReport {
  return {
    issues: report.issues.map(deserializeLintIssue),
    passed: report.passed,
  }
}

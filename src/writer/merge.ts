import type { WikiArticle } from '../models/article.js'
import type { LintIssue, LintReport } from '../models/lint-report.js'
import type { RepoLlmResult } from '../pipeline/types.js'
import type { MergedArtifacts } from './types.js'

export function mergeRepoArtifacts(repoResults: RepoLlmResult[]): MergedArtifacts {
  const complete = repoResults.filter((result) => result.status === 'complete')
  const articlesBySlug = new Map<string, WikiArticle>()
  const slugWinners = new Map<string, string>()
  const mergeLog: string[] = []
  const sourceRepos = complete.map((result) => result.repo)

  for (const result of complete) {
    for (const article of result.articles) {
      const existing = articlesBySlug.get(article.slug)
      if (existing) {
        mergeLog.push(`${article.slug}: ${existing.sourceRepos.join(', ')} → ${result.repo}`)
      }
      articlesBySlug.set(article.slug, {
        ...article,
        sourceRepos: mergeSourceRepos(existing, article, result.repo),
      })
      slugWinners.set(article.slug, result.repo)
    }
  }

  const articles = [...articlesBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug))
  const lint = mergeLintReports(complete, slugWinners)

  return { articles, lint, sourceRepos, mergeLog }
}

function mergeSourceRepos(
  existing: WikiArticle | undefined,
  article: WikiArticle,
  repo: string,
): string[] {
  const merged = new Set<string>([...(existing?.sourceRepos ?? []), ...article.sourceRepos, repo])
  return [...merged].sort()
}

function mergeLintReports(complete: RepoLlmResult[], slugWinners: Map<string, string>): LintReport {
  const issues: LintIssue[] = []

  for (const result of complete) {
    for (const issue of result.lint.issues) {
      if (issue.article === '_meta' || slugWinners.get(issue.article) === result.repo) {
        issues.push(issue)
      }
    }
  }

  const passed = complete.length > 0 && complete.every((result) => result.lint.passed)
  return { issues, passed }
}

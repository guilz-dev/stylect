import { looksTruncatedArticleContent } from '../compile/validate-article.js'
import type { OutputLanguage } from '../config.js'
import type { WikiArticle } from '../models/article.js'
import type { LintIssue } from '../models/lint-report.js'

function staticMessage(outputLanguage: OutputLanguage, key: 'truncated' | 'dual-codebase'): string {
  if (outputLanguage === 'ja') {
    return key === 'truncated'
      ? '記事本文が途中で切れている可能性があります（最終文またはセクションが未完了）。'
      : 'JavaScript と TypeScript の別コードベースとして記述されていますが、このリポジトリは単一の TypeScript 実装です。'
  }
  return key === 'truncated'
    ? 'Article content appears truncated (incomplete final sentence or section).'
    : 'Describes separate JavaScript and TypeScript codebases, but the repo is a single TypeScript implementation.'
}

function staticSuggestion(
  outputLanguage: OutputLanguage,
  key: 'truncated' | 'dual-codebase',
): string {
  if (outputLanguage === 'ja') {
    return key === 'truncated'
      ? 'compile を --fresh で再実行するか、記事あたりの観測量を減らして本文が完結するようにしてください。'
      : '単一の TypeScript コードベースとして記述し、[[languages/javascript]] / [[languages/typescript]] は履歴クラスタの観測として扱ってください。'
  }
  return key === 'truncated'
    ? 'Re-run compile with --fresh or shorten observations per article so the LLM can finish the body.'
    : 'Describe one TypeScript codebase; use [[languages/javascript]] and [[languages/typescript]] for mined language clusters only.'
}

export function collectStaticLintIssues(
  articles: WikiArticle[],
  outputLanguage: OutputLanguage,
): LintIssue[] {
  const issues: LintIssue[] = []

  for (const article of articles) {
    if (looksTruncatedArticleContent(article.content)) {
      issues.push({
        article: article.slug,
        severity: 'error',
        message: staticMessage(outputLanguage, 'truncated'),
        suggestion: staticSuggestion(outputLanguage, 'truncated'),
      })
    }

    if (article.slug === 'code-structure') {
      if (
        /both javascript and typescript codebases/i.test(article.content) ||
        /In JavaScript,.*In TypeScript,/s.test(article.content)
      ) {
        issues.push({
          article: article.slug,
          severity: 'error',
          message: staticMessage(outputLanguage, 'dual-codebase'),
          suggestion: staticSuggestion(outputLanguage, 'dual-codebase'),
        })
      }
    }
  }

  return issues
}

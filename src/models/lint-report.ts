export type LintSeverity = 'info' | 'warning' | 'error'

export type LintIssue = {
  article: string
  severity: LintSeverity
  message: string
  suggestion?: string
}

export type LintReport = {
  issues: LintIssue[]
  passed: boolean
}

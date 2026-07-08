import type { SampledCluster } from '../models/cluster.js'

export function buildExtractPrompt(cluster: SampledCluster): string {
  const lines = [
    `Repository: ${cluster.repo}`,
    `Language: ${cluster.language}`,
    `Commits (${cluster.commits.length} of ${cluster.totalInGroup} total):`,
    '',
  ]

  for (const commit of cluster.commits) {
    lines.push(`--- Commit ${commit.sha.slice(0, 8)} ---`)
    lines.push(`Date: ${commit.authoredAt}`)
    lines.push(`Message: ${commit.message}`)
    lines.push(`Stats: +${commit.additions} -${commit.deletions}`)
    if (commit.files.length > 0) {
      lines.push('Files:')
      for (const file of commit.files.slice(0, 20)) {
        const patchPreview = file.patch ? file.patch.slice(0, 500) : ''
        lines.push(`  ${file.status} ${file.filename} (+${file.additions} -${file.deletions})`)
        if (patchPreview) {
          lines.push(`    ${patchPreview}`)
        }
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

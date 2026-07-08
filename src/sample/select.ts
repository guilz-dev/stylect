import type { RawCommit } from '../models/commit.js'

/** Sample up to n commits: most recent + largest diffs + random fill (seed 42). */
export function sampleGroup(commits: RawCommit[], n: number): RawCommit[] {
  if (commits.length <= n) {
    return commits
  }

  const selected = new Map<string, RawCommit>()

  const byDate = [...commits].sort(
    (a, b) => new Date(b.authoredAt).getTime() - new Date(a.authoredAt).getTime(),
  )
  const recentN = Math.floor(n / 3)
  for (const commit of byDate.slice(0, recentN)) {
    selected.set(commit.sha, commit)
  }

  const bySize = [...commits].sort(
    (a, b) => a.additions + a.deletions - (b.additions + b.deletions),
  )
  const largeN = Math.floor(n / 3)
  for (const commit of bySize.slice(-largeN)) {
    selected.set(commit.sha, commit)
  }

  const remaining = commits.filter((commit) => !selected.has(commit.sha))
  const fillN = n - selected.size
  if (fillN > 0 && remaining.length > 0) {
    const picked = seededSample(remaining, Math.min(fillN, remaining.length), 42)
    for (const commit of picked) {
      selected.set(commit.sha, commit)
    }
  }

  return [...selected.values()]
}

function seededSample<T>(items: T[], count: number, seed: number): T[] {
  const rng = mulberry32(seed)
  const pool = [...items]
  const result: T[] = []
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const index = Math.floor(rng() * pool.length)
    const picked = pool[index]
    if (!picked) {
      break
    }
    result.push(picked)
    pool.splice(index, 1)
  }
  return result
}

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

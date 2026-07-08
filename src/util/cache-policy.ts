/** Shared cache policy for sample and LLM stages. */
export function shouldUseCache(
  fresh: boolean,
  cacheExists: boolean,
  newCommitCount: number,
): boolean {
  return !fresh && cacheExists && newCommitCount === 0
}

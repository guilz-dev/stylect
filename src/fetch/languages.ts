import { githubRequest } from './github-request.js'

export async function fetchRepoLanguages(repo: string, token: string): Promise<string[]> {
  const [owner, name] = repo.split('/')
  if (!owner || !name) {
    return []
  }

  try {
    const response = await githubRequest(token, `/repos/${owner}/${name}/languages`)
    const data = (await response.json()) as Record<string, number>
    return Object.keys(data).sort()
  } catch {
    return []
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function githubRequest(
  token: string,
  path: string,
  params?: Record<string, string | undefined>,
): Promise<Response> {
  const url = new URL(`https://api.github.com${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value)
      }
    }
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }

  let response = await fetch(url, { headers })
  if (response.status === 403 && response.headers.get('X-RateLimit-Reset')) {
    const reset = Number.parseInt(response.headers.get('X-RateLimit-Reset') ?? '0', 10)
    const waitMs = Math.max(reset * 1000 - Date.now(), 1000)
    await sleep(waitMs)
    response = await fetch(url, { headers })
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub API ${path} failed (${response.status}): ${body.slice(0, 200)}`)
  }

  return response
}

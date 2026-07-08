import type { WikiArticle } from '../models/article.js'

export function articleLinkMap(articles: WikiArticle[]): Map<string, WikiArticle> {
  return new Map(articles.map((article) => [article.slug, article]))
}

export function wikiLinkPath(slug: string, articlesBySlug: Map<string, WikiArticle>): string {
  if (slug.startsWith('languages/')) {
    return slug
  }

  const article = articlesBySlug.get(slug)
  if (article?.category === 'language') {
    return `languages/${slug}`
  }

  return slug
}

export function normalizeWikiWikilinks(content: string, articles: WikiArticle[]): string {
  const articlesBySlug = articleLinkMap(articles)

  return content.replace(/\[\[([^\]]+)\]\]/g, (match, inner: string) => {
    const parts = inner.split('|')
    const slugPart = (parts[0] ?? '').trim()
    const display = parts[1]
    const normalized = slugPart.toLowerCase().replace(/ /g, '-')

    if (normalized.startsWith('languages/') || !articlesBySlug.has(normalized)) {
      return match
    }

    const path = wikiLinkPath(normalized, articlesBySlug)
    if (path === normalized) {
      return match
    }

    return display ? `[[${path}|${display}]]` : `[[${path}]]`
  })
}

export function convertWikilinksToMarkdown(content: string, articles: WikiArticle[]): string {
  const articlesBySlug = articleLinkMap(articles)
  const titles = new Map(articles.map((article) => [article.slug, article.title]))

  return content.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
    const parts = inner.split('|')
    const slugPart = (parts[0] ?? '').trim()
    const display = (parts[1] ?? titles.get(slugPart) ?? slugPart.replace(/-/g, ' ')).trim()
    const normalized = slugPart.toLowerCase().replace(/ /g, '-')
    const resolvedSlug = normalized.startsWith('languages/')
      ? normalized.slice('languages/'.length)
      : normalized

    if (!articlesBySlug.has(resolvedSlug) && !articlesBySlug.has(normalized)) {
      return display
    }

    const path = wikiLinkPath(
      articlesBySlug.has(resolvedSlug) ? resolvedSlug : normalized,
      articlesBySlug,
    )
    return `[${display}](${path}.md)`
  })
}

export type WikiArticle = {
  slug: string
  title: string
  category: 'dimension' | 'language'
  confidence: number
  sourceRepos: string[]
  content: string
  wikilinks: string[]
}

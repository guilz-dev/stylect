import type { StyleDimension } from './style-dimension.js'

export type Observation = {
  dimension: StyleDimension
  claim: string
  evidence: string[]
  confidence: number
  language?: string
}

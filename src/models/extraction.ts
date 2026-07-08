import type { Observation } from './observation.js'

export type ClusterExtraction = {
  repo: string
  language: string
  observations: Observation[]
}

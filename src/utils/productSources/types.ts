/**
 * Multi-source product validation.
 *
 * Each "source" (local community DB, Open Food Facts, LCBO, on-can vision) returns
 * a partial `ProductFacts`. `reconcile.ts` cross-validates them field-by-field so the
 * confirm UI can show agreement / conflicts and prefill the winning values.
 */

import type { Material } from '../../db'

export type SourceId = 'localDb' | 'off' | 'lcbo' | 'vision'

export const SOURCE_LABELS: Record<SourceId, string> = {
  localDb: 'Community DB',
  off: 'Open Food Facts',
  lcbo: 'LCBO',
  vision: 'Photo (AI)',
}

export interface Nutrition {
  /** kcal per 100 mL (OFF basis) or per serving where that's all that's available */
  energyKcal?: number
  carbsG?: number
  sugarsG?: number
  /** alcohol % by volume */
  alcoholPct?: number
}

export interface ProductFacts {
  name?: string
  brand?: string
  material?: Material
  volumeMl?: number
  abv?: number
  type?: string
  nutrition?: Nutrition
}

/** Runtime config selecting how the on-can vision extractor reaches the model. */
export interface VisionRuntimeConfig {
  mode: 'mock' | 'byok' | 'proxy'
  /** Anthropic API key for bring-your-own-key (direct) mode. */
  apiKey?: string
  /** Serverless proxy URL for proxy mode. */
  proxyUrl?: string
  /** Optional shared secret sent as x-proxy-secret when the proxy sets PROXY_SECRET. */
  proxySecret?: string
  /** Claude model id (e.g. claude-haiku-4-5); defaults in the extractor. */
  model?: string
}

export interface SourceResult {
  source: SourceId
  facts: ProductFacts
  /** 0..1 — how much we trust this source's data for this lookup */
  confidence: number
  /** true when the source returned usable data */
  ok: boolean
  /** human note, e.g. "no match", "simulated (mock extractor)" */
  note?: string
}

/** Cross-source agreement for a single field. */
export interface FieldConsensus<T> {
  value?: T
  /** sources backing the winning value */
  sources: SourceId[]
  /** true when sources returned differing values */
  conflict: boolean
  /** the differing (non-winning) values, for display */
  others: { source: SourceId; value: T }[]
}

export interface ReconciledNutrition {
  energyKcal: FieldConsensus<number>
  carbsG: FieldConsensus<number>
  sugarsG: FieldConsensus<number>
  alcoholPct: FieldConsensus<number>
}

export interface ReconciledFacts {
  name: FieldConsensus<string>
  brand: FieldConsensus<string>
  material: FieldConsensus<Material>
  volumeMl: FieldConsensus<number>
  abv: FieldConsensus<number>
  nutrition: ReconciledNutrition
  /** raw per-source results, for the sources panel */
  sources: SourceResult[]
  /** 0..1 overall, driven by how many fields had multi-source agreement */
  confidence: number
}

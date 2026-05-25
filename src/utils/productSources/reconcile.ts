import type {
  FieldConsensus, ProductFacts, ReconciledFacts, ReconciledNutrition, SourceResult,
} from './types'

/** Normalise a value into a grouping key so near-equal values count as agreement. */
function keyOf(value: unknown): string {
  if (typeof value === 'string') return value.trim().toLowerCase()
  if (typeof value === 'number') return String(value)
  return String(value)
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'number') return !Number.isNaN(value)
  return true
}

/** Pick the most-agreed value for one field across all sources. */
export function consensus<T>(
  results: SourceResult[],
  pick: (f: ProductFacts) => T | undefined,
): FieldConsensus<T> {
  const entries = results
    .filter(r => r.ok)
    .map(r => ({ source: r.source, value: pick(r.facts) }))
    .filter((e): e is { source: SourceResult['source']; value: T } => isPresent(e.value))

  if (entries.length === 0) return { value: undefined, sources: [], conflict: false, others: [] }

  const groups = new Map<string, { value: T; sources: SourceResult['source'][] }>()
  for (const e of entries) {
    const k = keyOf(e.value)
    const g = groups.get(k)
    if (g) g.sources.push(e.source)
    else groups.set(k, { value: e.value, sources: [e.source] })
  }

  // Winner = most sources; ties broken by first-seen (Map preserves insertion order).
  const sorted = [...groups.values()].sort((a, b) => b.sources.length - a.sources.length)
  const winner = sorted[0]
  const others = sorted.slice(1).flatMap(g => g.sources.map(s => ({ source: s, value: g.value })))

  return {
    value: winner.value,
    sources: winner.sources,
    conflict: sorted.length > 1,
    others,
  }
}

/** Per-field score: agreement across ≥2 sources is strongest, a lone source is partial. */
function fieldScore(c: FieldConsensus<unknown>): number {
  if (c.value === undefined) return 0
  if (c.conflict) return 0.4
  return c.sources.length >= 2 ? 1 : 0.6
}

export function reconcileFacts(results: SourceResult[]): ReconciledFacts {
  const name     = consensus(results, f => f.name)
  const brand    = consensus(results, f => f.brand)
  const material = consensus(results, f => f.material)
  const volumeMl = consensus(results, f => f.volumeMl)
  const abv      = consensus(results, f => f.abv)

  const nutrition: ReconciledNutrition = {
    energyKcal: consensus(results, f => f.nutrition?.energyKcal),
    carbsG:     consensus(results, f => f.nutrition?.carbsG),
    sugarsG:    consensus(results, f => f.nutrition?.sugarsG),
    alcoholPct: consensus(results, f => f.nutrition?.alcoholPct),
  }

  // Overall confidence: average of the identity fields that matter most for adding an item.
  const core = [name, material, volumeMl]
  const confidence = core.reduce((s, c) => s + fieldScore(c), 0) / core.length

  return { name, brand, material, volumeMl, abv, nutrition, sources: results, confidence }
}

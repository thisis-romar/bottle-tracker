import type { OFFResult } from '../offLookup'
import { reconcileFacts } from './reconcile'
import { lookupLocalDb } from './localDb'
import { lookupOpenFoodFacts } from './openFoodFacts'
import { lookupLcbo } from './lcbo'
import { extractWithVision } from './vision'
import type { ReconciledFacts, SourceResult } from './types'

export type { ReconciledFacts, SourceResult, SourceId, ProductFacts, Nutrition, FieldConsensus } from './types'
export { SOURCE_LABELS } from './types'
export { reconcileFacts } from './reconcile'

/** Never-reject wrapper so one slow/failing source can't sink the batch. */
async function safe(p: Promise<SourceResult>, source: SourceResult['source']): Promise<SourceResult> {
  try {
    return await p
  } catch {
    return { source, facts: {}, confidence: 0, ok: false, note: 'error' }
  }
}

export interface GatherInput {
  barcode?: string
  imageJpeg?: Blob | null
  aiEnabled: boolean
  /** Pre-fetched OFF result to avoid a duplicate network call. */
  offResult?: OFFResult | null
}

/** Run all configured sources in parallel and cross-validate the results. */
export async function gatherProductFacts(input: GatherInput): Promise<ReconciledFacts> {
  const tasks: Promise<SourceResult>[] = [
    safe(lookupLocalDb(input.barcode), 'localDb'),
    safe(lookupOpenFoodFacts(input.barcode, input.offResult ?? undefined), 'off'),
    safe(lookupLcbo({ barcode: input.barcode }), 'lcbo'),
  ]
  if (input.aiEnabled) {
    tasks.push(safe(extractWithVision(input.imageJpeg ?? null, input.barcode), 'vision'))
  }
  const results = await Promise.all(tasks)
  return reconcileFacts(results)
}

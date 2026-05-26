import type { OFFResult } from '../offLookup'
import { reconcileFacts } from './reconcile'
import { lookupLocalDb } from './localDb'
import { lookupOpenFoodFacts } from './openFoodFacts'
import { lookupLcbo } from './lcbo'
import { extractWithVision } from './vision'
import { extractWithOcr } from './ocr'
import type { ReconciledFacts, SourceResult, SourceId, VisionRuntimeConfig } from './types'

export type { ReconciledFacts, SourceResult, SourceId, ProductFacts, Nutrition, FieldConsensus, VisionRuntimeConfig } from './types'
export { SOURCE_LABELS } from './types'
export { reconcileFacts } from './reconcile'
export { extractWithVision } from './vision'

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
  /** Run the offline on-device OCR source on the captured frame. */
  ocrEnabled?: boolean
  /** Pre-fetched OFF result to avoid a duplicate network call. */
  offResult?: OFFResult | null
  /** Selects the on-can vision extractor (mock / byok / proxy). */
  visionConfig?: VisionRuntimeConfig
}

/** First non-empty name/brand from the phase-1 sources, in trust order. */
function bestName(results: SourceResult[]): string | undefined {
  const order: SourceId[] = ['localDb', 'off', 'vision']
  for (const id of order) {
    const r = results.find(x => x.source === id && x.ok)
    const n = r?.facts.name || r?.facts.brand
    if (n?.trim()) return n.trim()
  }
  return undefined
}

/** Run all configured sources and cross-validate. LCBO is phase 2 — it has no
 *  barcode lookup, so it needs a product name derived from the phase-1 sources. */
export async function gatherProductFacts(input: GatherInput): Promise<ReconciledFacts> {
  const image = input.imageJpeg ?? null
  const phase1: Promise<SourceResult>[] = [
    safe(lookupLocalDb(input.barcode), 'localDb'),
    safe(lookupOpenFoodFacts(input.barcode, input.offResult ?? undefined), 'off'),
  ]
  if (input.aiEnabled) phase1.push(safe(extractWithVision(image, input.visionConfig), 'vision'))
  if (input.ocrEnabled) phase1.push(safe(extractWithOcr(image), 'ocr'))
  const phase1Results = await Promise.all(phase1)

  const lcbo = await safe(
    lookupLcbo({ name: bestName(phase1Results), proxyUrl: input.visionConfig?.proxyUrl }),
    'lcbo',
  )

  // Stable source order for the panel: DB, OFF, LCBO, vision, OCR.
  const order: SourceId[] = ['localDb', 'off', 'lcbo', 'vision', 'ocr']
  const all = [...phase1Results, lcbo]
  const ordered = order
    .map(id => all.find(r => r.source === id))
    .filter((r): r is SourceResult => !!r)
  return reconcileFacts(ordered)
}

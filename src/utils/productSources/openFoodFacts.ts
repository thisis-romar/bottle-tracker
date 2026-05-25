import { lookupBarcode, type OFFResult } from '../offLookup'
import type { SourceResult } from './types'

const CONFIDENCE: Record<OFFResult['confidence'], number> = {
  full: 0.85,
  partial: 0.5,
  'name-only': 0.3,
  miss: 0,
}

/** Open Food Facts adapter. Accepts a pre-fetched result to avoid a duplicate network call. */
export async function lookupOpenFoodFacts(
  barcode?: string,
  prefetched?: OFFResult,
): Promise<SourceResult> {
  if (!barcode) return { source: 'off', facts: {}, confidence: 0, ok: false, note: 'no barcode' }

  const off = prefetched ?? (await lookupBarcode(barcode))
  if (off.confidence === 'miss') {
    return { source: 'off', facts: {}, confidence: 0, ok: false, note: 'no match' }
  }

  return {
    source: 'off',
    facts: {
      name: off.name,
      brand: off.brand,
      material: off.material,
      volumeMl: off.volumeMl,
      abv: off.abv,
      nutrition: off.nutrition,
    },
    confidence: CONFIDENCE[off.confidence],
    ok: true,
  }
}

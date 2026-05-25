import { db } from '../../db'
import type { SourceResult } from './types'

/** Local/community DB: barcodes seeded from product-db.json + the user's own confirmations. */
export async function lookupLocalDb(barcode?: string): Promise<SourceResult> {
  if (!barcode) return { source: 'localDb', facts: {}, confidence: 0, ok: false, note: 'no barcode' }
  try {
    const rec = await db.barcodes.get(barcode)
    if (!rec) return { source: 'localDb', facts: {}, confidence: 0, ok: false, note: 'no match' }
    return {
      source: 'localDb',
      facts: { name: rec.name, material: rec.material, volumeMl: rec.volumeMl },
      confidence: 0.95,
      ok: true,
    }
  } catch {
    return { source: 'localDb', facts: {}, confidence: 0, ok: false, note: 'lookup failed' }
  }
}

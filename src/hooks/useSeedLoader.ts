import { useEffect } from 'react'
import { db } from '../db'
import { VERIFIED_SEED } from '../data/ontarioSeed'
import { calculateRefundCents } from '../utils/refund'

// Increment this key to force a re-seed on the next app load
// (e.g. when new verified entries are added to VERIFIED_SEED)
const SEED_VERSION_KEY = 'bottle_seed_v1'

export function useSeedLoader() {
  useEffect(() => {
    if (localStorage.getItem(SEED_VERSION_KEY)) return

    async function load() {
      try {
        // Only insert barcodes the user hasn't already customised
        const existing = await db.barcodes.toCollection().primaryKeys() as string[]
        const existingSet = new Set(existing)

        const toAdd = VERIFIED_SEED
          .filter(s => !existingSet.has(s.barcode))
          .map(s => ({
            ...s,
            refundCents: calculateRefundCents(s.material, s.volumeMl) as 10 | 20,
            updatedAt: new Date().toISOString()
          }))

        if (toAdd.length > 0) {
          await db.barcodes.bulkAdd(toAdd)
          console.info(`[seed] Loaded ${toAdd.length} verified barcode(s)`)
        }

        localStorage.setItem(SEED_VERSION_KEY, '1')
      } catch (err) {
        console.warn('[seed] Load failed, will retry next launch', err)
      }
    }

    load()
  }, [])
}

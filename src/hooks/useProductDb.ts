/**
 * Loads product data into IndexedDB on mount:
 *  1. Verified seed (hardcoded, 2 entries, check-digit verified)
 *  2. Community product-db.json (static file, grows via PRs)
 *
 * Replaces useSeedLoader — import this in App.tsx instead.
 */

import { useEffect } from 'react'
import { db } from '../db'
import { VERIFIED_SEED } from '../data/ontarioSeed'
import { loadProductDb } from '../utils/productDb'
import { calculateRefundCents } from '../utils/refund'

const SEED_KEY = 'bottle_seed_v1'

export function useProductDb() {
  useEffect(() => {
    async function init() {
      // ── 1. Verified seed (tiny, hardcoded) ──────────────────────────────
      if (!localStorage.getItem(SEED_KEY)) {
        try {
          const existing = new Set(
            await db.barcodes.toCollection().primaryKeys() as string[]
          )
          const toAdd = VERIFIED_SEED
            .filter(s => !existing.has(s.barcode))
            .map(s => ({
              ...s,
              refundCents: calculateRefundCents(s.material, s.volumeMl) as 10 | 20,
              updatedAt: new Date().toISOString()
            }))
          if (toAdd.length) await db.barcodes.bulkAdd(toAdd)
          localStorage.setItem(SEED_KEY, '1')
        } catch (err) {
          console.warn('[seed] failed:', err)
        }
      }

      // ── 2. Community product-db.json ────────────────────────────────────
      // Runs every time but version-checks internally — no-ops when up to date.
      await loadProductDb()
    }

    init()
  }, [])
}

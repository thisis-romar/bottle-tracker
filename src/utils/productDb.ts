/**
 * Community product database loader.
 *
 * Flow:
 *  1. Fetch /product-db.json (served as static asset, cached by SW offline)
 *  2. Compare version against last loaded version in localStorage
 *  3. If newer: merge into IndexedDB barcodes table (user edits win)
 *  4. Store new version number
 */

import { db } from '../db'
import { calculateRefundCents } from './refund'
import type { Material } from '../db'

const DB_VERSION_KEY = 'product_db_version'

export interface ProductRecord {
  name: string
  brand?: string
  brewer?: string
  material: Material
  volumeMl: number
  abv?: number
  type?: string
  verifiedBy?: string
  addedDate?: string
}

export interface ProductDbFile {
  version: number
  generated: string
  products: Record<string, ProductRecord>
}

export async function loadProductDb(baseUrl = import.meta.env.BASE_URL): Promise<{ loaded: number; skipped: number }> {
  let file: ProductDbFile

  try {
    // BASE_URL ends in '/', so no leading slash here — yields '/bottle-tracker/product-db.json'
    // in prod and '/product-db.json' in dev (the old missing-base form 404'd under the Pages base).
    const res = await fetch(`${baseUrl}product-db.json`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    file = await res.json() as ProductDbFile
  } catch (err) {
    console.warn('[productDb] Could not fetch product-db.json:', err)
    return { loaded: 0, skipped: 0 }
  }

  const lastVersion = parseInt(localStorage.getItem(DB_VERSION_KEY) ?? '0', 10)
  if (file.version <= lastVersion) {
    return { loaded: 0, skipped: 0 }
  }

  // Load existing barcodes so we don't overwrite user customisations
  const existingKeys = new Set(
    await db.barcodes.toCollection().primaryKeys() as string[]
  )

  const toAdd = Object.entries(file.products)
    .filter(([barcode]) => !existingKeys.has(barcode))
    .map(([barcode, p]) => ({
      barcode,
      name: p.name,
      material: p.material,
      volumeMl: p.volumeMl,
      refundCents: calculateRefundCents(p.material, p.volumeMl) as 10 | 20,
      updatedAt: p.addedDate ?? new Date().toISOString()
    }))

  const skipped = Object.keys(file.products).length - toAdd.length

  if (toAdd.length > 0) {
    await db.barcodes.bulkAdd(toAdd)
  }

  localStorage.setItem(DB_VERSION_KEY, String(file.version))
  console.info(`[productDb] v${file.version}: loaded ${toAdd.length}, skipped ${skipped} (user-customised)`)

  return { loaded: toAdd.length, skipped }
}

/** Force-reload ignoring version cache — useful after a manual import */
export async function forceReloadProductDb(): Promise<{ loaded: number; skipped: number }> {
  localStorage.removeItem(DB_VERSION_KEY)
  return loadProductDb()
}

/** Build a GitHub Issues URL pre-filled with a barcode contribution */
export function buildContributeUrl(params: {
  barcode: string
  name: string
  material: Material
  volumeMl: number
  abv?: number
  type?: string
}): string | null {
  const base = import.meta.env.VITE_CONTRIBUTE_URL as string | undefined
  if (!base) return null

  const url = new URL(base)
  url.searchParams.set('barcode', params.barcode)
  url.searchParams.set('name', params.name)
  url.searchParams.set('material', params.material)
  url.searchParams.set('volumeMl', String(params.volumeMl))
  if (params.abv)  url.searchParams.set('abv', String(params.abv))
  if (params.type) url.searchParams.set('type', params.type)
  return url.toString()
}

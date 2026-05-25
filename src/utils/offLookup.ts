/**
 * Open Food Facts lookup.
 * Docs: https://wiki.openfoodfacts.org/API/Read/Product
 *
 * OFF is crowd-sourced; coverage for Ontario products is reasonable for
 * mainstream beer/cider/wine but spotty for local/craft labels.
 * Always returns partial data gracefully — callers must handle missing fields.
 */

import type { Material } from '../db'
import type { Nutrition } from './productSources/types'
import { calculateRefundCents } from './refund'

export interface OFFResult {
  /** Raw product name from OFF */
  name?: string
  material?: Material
  volumeMl?: number
  refundCents?: 10 | 20
  /** Brand name from OFF, used when product_name is missing */
  brand?: string
  /** alcohol % by volume, when present */
  abv?: number
  /** nutrition facts, when present (sparse for alcohol) */
  nutrition?: Nutrition
  /** How well we were able to parse the OFF record */
  confidence: 'full' | 'partial' | 'name-only' | 'miss'
  source: 'off'
}

interface OFFNutriments {
  'energy-kcal_100g'?: number
  'energy-kcal_serving'?: number
  carbohydrates_100g?: number
  sugars_100g?: number
  alcohol_100g?: number
}

interface OFFProductResponse {
  status: number
  product?: {
    product_name?: string
    product_name_en?: string
    brands?: string
    quantity?: string
    packaging?: string
    packaging_tags?: string[]
    categories_tags?: string[]
    nutriments?: OFFNutriments
    alcohol_value?: number
  }
}

/** Main entry point. Resolves in ≤ 5 s; never throws. */
export async function lookupBarcode(barcode: string): Promise<OFFResult> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}` +
      `?fields=product_name,product_name_en,brands,quantity,packaging,packaging_tags,categories_tags,nutriments,alcohol_value`,
      { signal: controller.signal }
    )
    clearTimeout(timer)

    if (!res.ok) return miss()

    const data: OFFProductResponse = await res.json()
    if (data.status !== 1 || !data.product) return miss()

    return parseProduct(data.product)
  } catch {
    return miss()
  }
}

function miss(): OFFResult {
  return { confidence: 'miss', source: 'off' }
}

function parseProduct(p: NonNullable<OFFProductResponse['product']>): OFFResult {
  const name = (p.product_name_en || p.product_name || '').trim() || undefined
  const brand = p.brands?.split(',')[0].trim() || undefined

  const volumeMl = parseVolume(p.quantity)
  const material = parseMaterial(p.packaging, p.packaging_tags, p.categories_tags)

  const refundCents = (volumeMl && material)
    ? calculateRefundCents(material, volumeMl)
    : undefined

  const nutrition = parseNutrition(p.nutriments, p.alcohol_value)
  const abv = nutrition?.alcoholPct

  const confidence: OFFResult['confidence'] =
    volumeMl && material ? 'full'
    : volumeMl || material ? 'partial'
    : name || brand ? 'name-only'
    : 'miss'

  return { name, brand, volumeMl, material, refundCents, abv, nutrition, confidence, source: 'off' }
}

/** Best-effort nutrition extraction; OFF coverage for alcohol is sparse. */
function parseNutrition(n: OFFNutriments | undefined, alcoholValue: number | undefined): Nutrition | undefined {
  const num = (v: number | undefined) =>
    typeof v === 'number' && !Number.isNaN(v) ? v : undefined

  const nutrition: Nutrition = {
    energyKcal: num(n?.['energy-kcal_100g'] ?? n?.['energy-kcal_serving']),
    carbsG: num(n?.carbohydrates_100g),
    sugarsG: num(n?.sugars_100g),
    alcoholPct: num(n?.alcohol_100g ?? alcoholValue),
  }
  return Object.values(nutrition).some(v => v !== undefined) ? nutrition : undefined
}

// ─── Volume parsing ──────────────────────────────────────────────────────────

/** Extracts volume in mL from OFF's free-text quantity field.
 *  Handles: "355 mL", "500ml", "1 L", "1.5 l", "33 cl", "12 fl oz", "6 x 355 mL"
 */
export function parseVolume(quantity: string | undefined): number | undefined {
  if (!quantity) return undefined

  // Handle multi-pack: take the individual unit size, not total
  // "6 x 355 mL" → "355 mL"
  const multiMatch = quantity.match(/\d+\s*[x×]\s*([\d.,]+)\s*(m?l|cl|fl\.?\s*oz)/i)
  if (multiMatch) {
    return convertToMl(parseFloat(multiMatch[1].replace(',', '.')), multiMatch[2])
  }

  // Simple: "355 mL", "1.5l", "500 ml"
  const match = quantity.match(/([\d.,]+)\s*(m?l|cl|fl\.?\s*oz)/i)
  if (!match) return undefined

  const value = parseFloat(match[1].replace(',', '.'))
  return convertToMl(value, match[2])
}

function convertToMl(value: number, unit: string): number | undefined {
  const u = unit.toLowerCase().replace(/\s/g, '')
  if (u === 'ml' || u === 'ml') return Math.round(value)
  if (u === 'l')   return Math.round(value * 1000)
  if (u === 'cl')  return Math.round(value * 10)
  if (u === 'floz' || u === 'fl.oz') return Math.round(value * 29.5735)
  return undefined
}

// ─── Material parsing ────────────────────────────────────────────────────────

const ALUMINUM_TERMS = ['aluminium', 'aluminum', 'alumínio', 'can', 'tin', 'metal']
const GLASS_TERMS    = ['glass', 'verre', 'vidro', 'vidrio', 'bottle', 'bouteille']
const PLASTIC_TERMS  = ['plastic', 'plastique', 'pet', 'hdpe', 'pp', 'ldpe']
const TETRA_TERMS    = ['tetra', 'carton', 'brick', 'paper', 'paperboard', 'composite']

export function parseMaterial(
  packaging: string | undefined,
  packagingTags: string[] | undefined,
  categoryTags: string[] | undefined
): Material | undefined {
  // Combine all signal sources into a single lowercase string
  const signals = [
    packaging ?? '',
    ...(packagingTags ?? []),
    ...(categoryTags ?? [])
  ].join(' ').toLowerCase()

  if (ALUMINUM_TERMS.some(t => signals.includes(t))) return 'aluminum'
  if (GLASS_TERMS.some(t => signals.includes(t)))    return 'glass'
  if (PLASTIC_TERMS.some(t => signals.includes(t)))  return 'plastic'
  if (TETRA_TERMS.some(t => signals.includes(t)))    return 'tetra'
  return undefined
}

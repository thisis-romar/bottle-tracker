import type { ProductFacts, SourceResult } from './types'
import { parseVolume, parseMaterial } from '../offLookup'

/**
 * LCBO source — name-based enrichment via the proxy.
 *
 * LCBO has no barcode/UPC lookup, so this runs in phase 2 of the pipeline with a
 * product name derived from the other sources. The browser can't reach the LCBO
 * GraphQL API directly (CORS), so it goes through the same Worker as vision, on its
 * `/lcbo` route (see worker/src/index.ts), which returns `{ ok, name, producer }`.
 *
 * Volume/material aren't trusted GraphQL fields, so we parse them from the returned
 * product name with the existing OFF parsers. Any failure degrades to no data.
 */
interface LcboInput {
  name?: string
  /** Vision proxy URL; the LCBO route lives on `/lcbo` of the same Worker. */
  proxyUrl?: string
}

interface LcboResponse {
  ok?: boolean
  name?: string
  producer?: string
  note?: string
}

function result(ok: boolean, facts: ProductFacts, note: string): SourceResult {
  return { source: 'lcbo', facts, confidence: ok ? 0.6 : 0, ok, note }
}

export async function lookupLcbo({ name, proxyUrl }: LcboInput): Promise<SourceResult> {
  const q = name?.trim()
  if (!q) return result(false, {}, 'no product name to search')
  if (!proxyUrl?.trim()) return result(false, {}, 'set the proxy URL in Settings (LCBO uses its /lcbo route)')

  let endpoint: string
  try {
    endpoint = new URL('/lcbo', proxyUrl).toString()
  } catch {
    return result(false, {}, 'invalid proxy URL')
  }

  const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`)
  if (!res.ok) return result(false, {}, `proxy error ${res.status}`)

  const data = (await res.json()) as LcboResponse
  if (!data.ok || !data.name) return result(false, {}, data.note || 'no match')

  const facts: ProductFacts = {
    name: data.name,
    brand: data.producer,
    volumeMl: parseVolume(data.name),
    material: parseMaterial(data.name, undefined, undefined),
  }
  return result(true, facts, 'LCBO name match')
}

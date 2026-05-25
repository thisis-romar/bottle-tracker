import type { SourceResult } from './types'

/**
 * LCBO source — best-effort.
 *
 * LCBO publishes no official API and has no barcode/UPC lookup; the old community
 * `lcboapi.com` is offline. The only realistic data is a name-based search scraped
 * from lcbo.com, which a static PWA can't do directly (CORS) — it needs the same
 * serverless proxy as the vision call. Until that proxy exists this returns no data
 * but stays wired into the pipeline so it lights up once configured.
 *
 * Future real impl: once we have a product name (from OFF/vision), query the proxy's
 * `/lcbo/search?q=<name>` for official volume/price and surface it as a validation source.
 */
export async function lookupLcbo(_input: { barcode?: string; name?: string }): Promise<SourceResult> {
  return {
    source: 'lcbo',
    facts: {},
    confidence: 0,
    ok: false,
    note: 'not configured (needs proxy + name search)',
  }
}

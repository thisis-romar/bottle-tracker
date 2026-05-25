/**
 * Real Claude vision extractor — DEFERRED / not yet wired into the pipeline.
 *
 * Documents the request shape with **prompt caching** baked in so the design is locked.
 * A static PWA can't embed a shared key, so `endpoint` is either:
 *   - a serverless proxy you deploy (recommended; holds the key server-side), or
 *   - the Anthropic API directly with a user-supplied key (bring-your-own-key), using
 *     the `anthropic-dangerous-direct-browser-access` header.
 *
 * Prompt caching: `cache_control: {type:'ephemeral'}` goes on the STATIC blocks — the
 * system instruction and the tool schema — but NOT on the per-call image. That amortises
 * the fixed instruction/schema tokens across every extraction.
 */

import type { ProductFacts, SourceResult } from './types'

export const VISION_MODEL = 'claude-haiku-4-5' // cheap; use 'claude-opus-4-7' for max accuracy

const SYSTEM_INSTRUCTION =
  'You are a beverage label extraction expert. From the photo of a single can/bottle, ' +
  'read the visible text and return ONLY structured data via the extract_product tool. ' +
  'Report a field only if you can actually read it; omit anything uncertain. ' +
  'Volume must be in millilitres. Material is the container, not the contents.'

const EXTRACT_PRODUCT_TOOL = {
  name: 'extract_product',
  description: 'Return the product details read from the beverage container photo.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Full product name as printed' },
      brand: { type: 'string' },
      material: { type: 'string', enum: ['glass', 'aluminum', 'plastic', 'tetra', 'unknown'] },
      volumeMl: { type: 'number', description: 'Container volume in millilitres' },
      abv: { type: 'number', description: 'Alcohol % by volume' },
      type: { type: 'string', description: 'beer | cider | wine | spirit | cooler | other' },
      nutrition: {
        type: 'object',
        properties: {
          energyKcal: { type: 'number' },
          carbsG: { type: 'number' },
          sugarsG: { type: 'number' },
          alcoholPct: { type: 'number' },
        },
      },
    },
  },
}

/** Build the Messages API request body with prompt caching on the static blocks. */
export function buildClaudeVisionRequest(imageBase64: string, mediaType = 'image/jpeg') {
  return {
    model: VISION_MODEL,
    max_tokens: 512,
    // System instruction is static → cache it.
    system: [
      { type: 'text', text: SYSTEM_INSTRUCTION, cache_control: { type: 'ephemeral' } },
    ],
    // Tool schema is static → cache it (last tool carries cache_control).
    tools: [{ ...EXTRACT_PRODUCT_TOOL, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: 'extract_product' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the product details from this image:' },
          // Per-call image — intentionally NOT cached.
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        ],
      },
    ],
  }
}

export interface ClaudeVisionConfig {
  /** Proxy URL (recommended) or 'https://api.anthropic.com/v1/messages' for BYO-key. */
  endpoint: string
  /** Only for direct BYO-key calls; omit when using a proxy that holds the key. */
  apiKey?: string
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary)
}

interface ClaudeToolUseResponse {
  content?: { type: string; name?: string; input?: ProductFacts }[]
}

/** Real extraction call. Not wired into `gatherProductFacts` yet — wire once an endpoint is chosen. */
export async function claudeVisionExtract(imageJpeg: Blob, config: ClaudeVisionConfig): Promise<SourceResult> {
  try {
    const base64 = await blobToBase64(imageJpeg)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (config.apiKey) {
      headers['x-api-key'] = config.apiKey
      headers['anthropic-version'] = '2023-06-01'
      headers['anthropic-dangerous-direct-browser-access'] = 'true'
    }
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildClaudeVisionRequest(base64)),
    })
    if (!res.ok) return { source: 'vision', facts: {}, confidence: 0, ok: false, note: `HTTP ${res.status}` }

    const data: ClaudeToolUseResponse = await res.json()
    const toolUse = data.content?.find(c => c.type === 'tool_use' && c.name === 'extract_product')
    const facts = (toolUse?.input ?? {}) as ProductFacts
    const ok = Object.keys(facts).length > 0
    return { source: 'vision', facts, confidence: ok ? 0.8 : 0, ok }
  } catch {
    return { source: 'vision', facts: {}, confidence: 0, ok: false, note: 'request failed' }
  }
}

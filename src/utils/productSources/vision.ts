import { claudeVisionExtract, ANTHROPIC_DIRECT } from './visionClaude'
import type { SourceResult, VisionRuntimeConfig } from './types'

function notConfigured(note: string): SourceResult {
  return { source: 'vision', facts: {}, confidence: 0, ok: false, note }
}

/**
 * On-can vision extractor. Dispatches by runtime config:
 *   - 'mock'  → simulated physical attributes (prototyping; no network)
 *   - 'byok'  → real Claude call direct from the browser with the user's key
 *   - 'proxy' → real Claude call via a serverless proxy that holds the key
 * Both real paths post the same prompt-cached request body (see visionClaude.ts).
 */
export async function extractWithVision(
  imageJpeg: Blob | null,
  config?: VisionRuntimeConfig,
): Promise<SourceResult> {
  if (!imageJpeg || imageJpeg.size === 0) return notConfigured('no image captured')

  const mode = config?.mode ?? 'mock'

  if (mode === 'byok') {
    if (!config?.apiKey) return notConfigured('add your Anthropic API key in Settings')
    return claudeVisionExtract(imageJpeg, { endpoint: ANTHROPIC_DIRECT, apiKey: config.apiKey, model: config.model })
  }

  if (mode === 'proxy') {
    if (!config?.proxyUrl) return notConfigured('set the proxy URL in Settings')
    return claudeVisionExtract(imageJpeg, { endpoint: config.proxyUrl, model: config.model })
  }

  // mock — no real extraction. Return NO facts so it can't fabricate agreement and inflate the
  // cross-check confidence; it just shows as an unconfigured source. Set a key or proxy for real.
  await new Promise(r => setTimeout(r, 200))
  return notConfigured('mock mode — set a key or proxy to read the can')
}

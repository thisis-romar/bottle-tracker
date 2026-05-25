import type { SourceResult } from './types'

/**
 * MOCK on-can vision extractor — for prototyping the pipeline + confirm UI.
 *
 * A mock can't actually read the label, so it returns only simulated *physical*
 * attributes (clearly flagged), which still exercises cross-validation against
 * DB/OFF on material + volume. Swap in `claudeVisionExtract` (visionClaude.ts)
 * for real label/nutrition reading.
 */
export async function extractWithVision(imageJpeg: Blob | null, _barcode?: string): Promise<SourceResult> {
  await new Promise(r => setTimeout(r, 350)) // simulate model latency
  if (!imageJpeg || imageJpeg.size === 0) {
    return { source: 'vision', facts: {}, confidence: 0, ok: false, note: 'no image captured' }
  }
  return {
    source: 'vision',
    facts: {
      material: 'aluminum',
      volumeMl: 355,
      nutrition: { energyKcal: 145, carbsG: 11, alcoholPct: 5 },
    },
    confidence: 0.5,
    ok: true,
    note: 'simulated (mock extractor)',
  }
}

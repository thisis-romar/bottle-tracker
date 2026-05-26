import type { Material } from '../../db'
import type { ProductFacts, SourceResult } from './types'
import { parseVolume } from '../offLookup'

/**
 * On-device OCR source (Tesseract.js, offline, no API key).
 *
 * A fallback for when a barcode is unknown and the AI vision extractor is off: it reads
 * printed text off a captured frame and recovers the easy-to-OCR fields (volume, ABV,
 * sometimes material). Assets are served from the app's own origin under /tesseract/ and
 * runtime-cached by the service worker (see vite.config.ts), so it works offline after the
 * first use. OCR of curved, glossy cans is unreliable — this is a best-effort pre-fill the
 * user still confirms, so anything it can't read is simply omitted.
 */

const COMMON_VOLUMES = new Set([
  187, 222, 250, 330, 341, 355, 375, 440, 458, 473, 500, 568, 650, 710, 750, 1000, 1140, 1500, 2000,
])

/** Conservative material cues — word-boundaried strong terms only. Avoids generic "can"/
 *  "bottle" which collide with label words like "Canada"/"Canadian". */
function ocrMaterial(text: string): Material | undefined {
  const s = text.toLowerCase()
  if (/alumin/.test(s) || /\bcanette\b/.test(s)) return 'aluminum'
  if (/\bglass\b/.test(s) || /\bbouteille\b/.test(s) || /\bverre\b/.test(s)) return 'glass'
  if (/\bpet\b/.test(s) || /\bplastic\b/.test(s) || /\bplastique\b/.test(s)) return 'plastic'
  if (/\btetra\b/.test(s) || /\bcarton\b/.test(s)) return 'tetra'
  return undefined
}

/** Parse the easy structured fields out of raw OCR text. Pure + unit-tested. */
export function parseOcrText(text: string): ProductFacts {
  const t = text.replace(/\s+/g, ' ')
  const facts: ProductFacts = {}

  // Volume: collect plausible beverage sizes, prefer a known common size.
  const candidates: number[] = []
  const re = /(\d{1,4}(?:[.,]\d{1,2})?)\s*(ml|millilitres?|cl|l|fl\.?\s*oz)\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(t)) !== null) {
    const v = parseVolume(`${m[1]} ${m[2]}`)
    if (v && v >= 50 && v <= 3000) candidates.push(v)
  }
  if (candidates.length) {
    facts.volumeMl = candidates.find(v => COMMON_VOLUMES.has(v)) ?? candidates[0]
  }

  const material = ocrMaterial(t)
  if (material) facts.material = material

  // ABV: "5.0% alc./vol." or "alc 4.6% vol"
  const abvMatch =
    t.match(/(\d{1,2}(?:[.,]\d)?)\s*%\s*(?:alc|vol|alc\.?\s*\/?\s*vol)/i) ??
    t.match(/(?:alc|vol)\.?\s*\/?\s*(?:vol\.?)?\s*(\d{1,2}(?:[.,]\d)?)\s*%/i)
  if (abvMatch) {
    const abv = parseFloat(abvMatch[1].replace(',', '.'))
    if (abv >= 0 && abv <= 80) facts.abv = abv
  }

  return facts
}

function notOk(note: string): SourceResult {
  return { source: 'ocr', facts: {}, confidence: 0, ok: false, note }
}

export async function extractWithOcr(imageJpeg: Blob | null): Promise<SourceResult> {
  if (!imageJpeg || imageJpeg.size === 0) return notOk('no image captured')

  const base = import.meta.env.BASE_URL
  try {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng', 1, {
      workerPath: `${base}tesseract/worker.min.js`,
      corePath: `${base}tesseract/`,
      langPath: `${base}tesseract/`,
    })
    try {
      const { data } = await worker.recognize(imageJpeg)
      const facts = parseOcrText(data.text || '')
      const ok = Object.keys(facts).length > 0
      return { source: 'ocr', facts, confidence: ok ? 0.5 : 0, ok, note: ok ? 'read from label' : 'no size/type read' }
    } finally {
      await worker.terminate()
    }
  } catch {
    return notOk('OCR unavailable')
  }
}

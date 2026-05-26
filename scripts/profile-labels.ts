#!/usr/bin/env tsx
/**
 * profile-labels.ts — offline OCR profiler for bottle/can label photos.
 *
 * Runs Tesseract.js in Node against the committed English data
 * (public/tesseract/eng.traineddata.gz — no network, no API key) and prints a
 * community-DB contribution stub per image. The stub shape matches
 * scripts/validate-contribution.mjs: OCR fills material/volumeMl/abv where legible;
 * barcode + name are left blank for you to complete.
 *
 * Usage:
 *   npm run profile:labels -- <image...> [--out <dir>]
 *
 * Notes:
 *   - Accepts JPG/PNG. Tesseract/leptonica can't read HEIC — convert iPhone photos first.
 *   - Best results on the front label (volume + ABV). Material is only detected when the
 *     label literally prints "glass"/"verre"/"aluminium"/etc.
 */
import { createWorker } from 'tesseract.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, basename } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { parseOcrText } from '../src/utils/productSources/ocr'

const here = dirname(fileURLToPath(import.meta.url))
const langPath = resolve(here, '..', 'public', 'tesseract')
const today = new Date().toISOString().slice(0, 10)

function parseArgs(argv: string[]) {
  const images: string[] = []
  let outDir: string | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') outDir = argv[++i]
    else images.push(argv[i])
  }
  return { images, outDir }
}

async function main() {
  const { images, outDir } = parseArgs(process.argv.slice(2))
  if (images.length === 0) {
    console.error('Usage: npm run profile:labels -- <image...> [--out <dir>]')
    process.exit(1)
  }
  if (!existsSync(join(langPath, 'eng.traineddata.gz'))) {
    console.error(`Missing OCR data at ${langPath}/eng.traineddata.gz`)
    process.exit(1)
  }
  if (outDir) mkdirSync(outDir, { recursive: true })

  const cachePath = join(tmpdir(), 'bottle-tracker-tess')
  mkdirSync(cachePath, { recursive: true })

  const worker = await createWorker('eng', 1, { langPath, cachePath, gzip: true, cacheMethod: 'none' })
  try {
    for (const img of images) {
      const path = resolve(img)
      if (!existsSync(path)) {
        console.error(`\n✗ ${img} — file not found, skipping`)
        continue
      }
      const { data } = await worker.recognize(path)
      const text = (data.text || '').trim()
      const facts = parseOcrText(text)

      const record: Record<string, unknown> = {
        name: '',
        material: facts.material ?? '',
        ...(facts.volumeMl != null ? { volumeMl: facts.volumeMl } : {}),
        ...(facts.abv != null ? { abv: facts.abv } : {}),
        type: '',
        verifiedBy: 'ocr-profile',
        addedDate: today,
      }

      console.log(`\n=== ${basename(img)} ===`)
      console.log('--- raw OCR text ---')
      console.log(text || '(no text recognized)')
      console.log('--- parsed facts ---', JSON.stringify(facts))
      console.log('--- contribution stub (fill barcode + name + type) ---')
      const stub = { '<FILL-BARCODE>': record }
      console.log(JSON.stringify(stub, null, 2))

      if (outDir) {
        const outPath = join(outDir, basename(img).replace(/\.[^.]+$/, '') + '.json')
        writeFileSync(outPath, JSON.stringify(stub, null, 2))
        console.log(`→ wrote ${outPath}`)
      }
    }
  } finally {
    await worker.terminate()
  }
}

main().catch(e => { console.error('FAILED:', e); process.exit(1) })

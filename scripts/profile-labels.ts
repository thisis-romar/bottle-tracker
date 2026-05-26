#!/usr/bin/env tsx
/**
 * profile-labels.ts — offline OCR profiler for bottle/can label photos.
 *
 * Runs Tesseract.js in Node against the committed English data
 * (public/tesseract/eng.traineddata.gz — no network, no API key), reuses the app's
 * parseOcrText, and emits a community-DB record per image (shape matches
 * scripts/validate-contribution.mjs). OCR fills material/volumeMl/abv where legible;
 * pass --barcode/--name/etc. for the fields OCR can't read.
 *
 * When a VALID --barcode is given and the record has name + material + volumeMl, the
 * script writes a merge-ready fragment to contributions/{barcode}.json (or --out <dir>),
 * which scripts/merge-contributions.mjs folds into public/product-db.json. Otherwise it
 * prints the stub and flags what's still missing.
 *
 * Usage:
 *   npm run profile:labels -- <image> [--barcode N] [--name S] [--brand S] [--brewer S]
 *                                     [--type S] [--material aluminum|glass|plastic|tetra]
 *                                     [--volume mL] [--abv pct] [--out <dir>]
 *
 * Notes:
 *   - Accepts JPG/PNG. Tesseract/leptonica can't read HEIC — convert iPhone photos first.
 *   - Best results on the front label (volume + ABV). Material is only OCR-detected when the
 *     label literally prints "glass"/"verre"/"aluminium"/etc.
 */
import { createWorker } from 'tesseract.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, basename } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { parseOcrText } from '../src/utils/productSources/ocr'
import { validateBarcode } from './lib/barcode.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const langPath = resolve(here, '..', 'public', 'tesseract')
const today = new Date().toISOString().slice(0, 10)
const MATERIALS = ['aluminum', 'glass', 'plastic', 'tetra']

interface Opts {
  images: string[]
  barcode?: string
  name?: string
  brand?: string
  brewer?: string
  type?: string
  material?: string
  volume?: number
  abv?: number
  outDir: string
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = { images: [], outDir: 'contributions' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--barcode': o.barcode = argv[++i]; break
      case '--name': o.name = argv[++i]; break
      case '--brand': o.brand = argv[++i]; break
      case '--brewer': o.brewer = argv[++i]; break
      case '--type': o.type = argv[++i]; break
      case '--material': o.material = argv[++i]; break
      case '--volume': o.volume = parseInt(argv[++i], 10); break
      case '--abv': o.abv = parseFloat(argv[++i]); break
      case '--out': o.outDir = argv[++i]; break
      default: o.images.push(a)
    }
  }
  return o
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.images.length === 0) {
    console.error('Usage: npm run profile:labels -- <image> [--barcode N --name S --type S ...] [--out <dir>]')
    process.exit(1)
  }
  if (!existsSync(join(langPath, 'eng.traineddata.gz'))) {
    console.error(`Missing OCR data at ${langPath}/eng.traineddata.gz`)
    process.exit(1)
  }
  if (opts.barcode && opts.images.length > 1) {
    console.error('--barcode applies to a single image; pass one image when writing a contribution.')
    process.exit(1)
  }

  const cachePath = join(tmpdir(), 'bottle-tracker-tess')
  mkdirSync(cachePath, { recursive: true })

  const worker = await createWorker('eng', 1, { langPath, cachePath, gzip: true, cacheMethod: 'none' })
  try {
    for (const img of opts.images) {
      const path = resolve(img)
      if (!existsSync(path)) {
        console.error(`\n✗ ${img} — file not found, skipping`)
        continue
      }
      const { data } = await worker.recognize(path)
      const text = (data.text || '').trim()
      const facts = parseOcrText(text)

      // Flags override OCR for fields OCR can't reliably read.
      const material = opts.material ?? facts.material
      const volumeMl = opts.volume ?? facts.volumeMl
      const abv = opts.abv ?? facts.abv

      const record: Record<string, unknown> = {
        name: opts.name ?? '',
        ...(opts.brand ? { brand: opts.brand } : {}),
        ...(opts.brewer ? { brewer: opts.brewer } : {}),
        material: material ?? '',
        ...(volumeMl != null ? { volumeMl } : {}),
        ...(abv != null ? { abv } : {}),
        type: opts.type ?? '',
        verifiedBy: 'ocr-profile',
        addedDate: today,
      }

      console.log(`\n=== ${basename(img)} ===`)
      console.log('--- raw OCR text ---')
      console.log(text || '(no text recognized)')
      console.log('--- parsed facts ---', JSON.stringify(facts))

      // Decide whether we can write a merge-ready contribution fragment.
      const missing: string[] = []
      if (!opts.barcode) missing.push('--barcode')
      else {
        const check = validateBarcode(opts.barcode)
        if (!check.valid) missing.push(`valid --barcode (${check.reason})`)
      }
      if (!record.name) missing.push('--name')
      if (!material || !MATERIALS.includes(material)) missing.push('--material')
      if (volumeMl == null) missing.push('--volume')

      if (missing.length === 0 && opts.barcode) {
        mkdirSync(opts.outDir, { recursive: true })
        const outPath = join(opts.outDir, `${opts.barcode}.json`)
        writeFileSync(outPath, JSON.stringify({ [opts.barcode]: record }, null, 2) + '\n')
        console.log(`✓ wrote merge-ready fragment → ${outPath}`)
        console.log(JSON.stringify({ [opts.barcode]: record }, null, 2))
      } else {
        console.log('--- stub (not written — fill the missing fields) ---')
        console.log(`missing: ${missing.join(', ')}`)
        console.log(JSON.stringify({ [opts.barcode ?? '<FILL-BARCODE>']: record }, null, 2))
      }
    }
  } finally {
    await worker.terminate()
  }
}

main().catch(e => { console.error('FAILED:', e); process.exit(1) })

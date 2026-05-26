#!/usr/bin/env node
/**
 * validate-contribution.mjs
 *
 * Parses a GitHub issue body for a barcode contribution,
 * validates the check digit, and writes a JSON fragment to
 * contributions/{barcode}.json for the merge action to pick up.
 *
 * Usage:
 *   node scripts/validate-contribution.mjs <issue_body_file> <output_dir>
 *
 * Exit codes:
 *   0 — valid, fragment written
 *   1 — invalid (check digit, missing fields, etc.)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { validateBarcode } from './lib/barcode.mjs'

const MATERIALS = ['aluminum', 'glass', 'plastic', 'tetra']

// ─── Parse GitHub issue body ─────────────────────────────────────────────────

function parseField(body, fieldId) {
  // GitHub YAML issue template bodies look like:
  // ### Field Label\n\nvalue\n\n
  // We match by section header containing the field content
  const lines = body.split('\n')
  let capture = false
  const values = []
  for (const line of lines) {
    if (line.startsWith('###')) {
      capture = false
    }
    if (capture && line.trim() && !line.startsWith('_No response_')) {
      values.push(line.trim())
    }
    if (line.startsWith('###') && line.toLowerCase().includes(fieldId.toLowerCase())) {
      capture = true
    }
  }
  return values.join(' ').trim()
}

// ─── Main ────────────────────────────────────────────────────────────────────

const [,, issueBodyFile, outputDir = 'contributions'] = process.argv

let body
try {
  body = readFileSync(issueBodyFile, 'utf8')
} catch {
  console.error('Could not read issue body file:', issueBodyFile)
  process.exit(1)
}

const barcode   = parseField(body, 'Barcode').replace(/\s/g, '')
const name      = parseField(body, 'Product Name')
const material  = parseField(body, 'Material').toLowerCase()
const volumeRaw = parseField(body, 'Volume')
const brand     = parseField(body, 'Brand')
const brewer    = parseField(body, 'Brewer')
const abvRaw    = parseField(body, 'ABV')
const type      = parseField(body, 'Beverage Type').toLowerCase().replace(/\/.*/, '')

const errors = []

// Validate barcode
const bcCheck = validateBarcode(barcode)
if (!bcCheck.valid) errors.push(`Barcode: ${bcCheck.reason}`)

// Validate material
if (!MATERIALS.includes(material)) errors.push(`Material "${material}" not in: ${MATERIALS.join(', ')}`)

// Validate volume
const volumeMl = parseInt(volumeRaw, 10)
if (isNaN(volumeMl) || volumeMl < 50 || volumeMl > 20000) {
  errors.push(`Volume "${volumeRaw}" is not a valid mL value (50–20000)`)
}

// Validate name
if (!name) errors.push('Product name is required')

if (errors.length > 0) {
  console.error('Validation failed:')
  errors.forEach(e => console.error(' -', e))
  process.exit(1)
}

// Build contribution record
const record = {
  name,
  ...(brand  ? { brand }  : {}),
  ...(brewer ? { brewer } : {}),
  material,
  volumeMl,
  ...(abvRaw && !isNaN(parseFloat(abvRaw)) ? { abv: parseFloat(abvRaw) } : {}),
  ...(type   ? { type }   : {}),
  verifiedBy: 'community-issue',
  addedDate: new Date().toISOString().slice(0, 10)
}

mkdirSync(outputDir, { recursive: true })
const outPath = join(outputDir, `${barcode}.json`)
writeFileSync(outPath, JSON.stringify({ [barcode]: record }, null, 2))

console.log(`✓ Valid — wrote ${outPath}`)
console.log(JSON.stringify(record, null, 2))
process.exit(0)

#!/usr/bin/env node
/**
 * merge-contributions.mjs
 *
 * Reads all *.json files from contributions/ and merges them
 * into public/product-db.json, incrementing the version number.
 *
 * Usage:
 *   node scripts/merge-contributions.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'

const DB_PATH = 'public/product-db.json'
const CONTRIB_DIR = 'contributions'

const db = JSON.parse(readFileSync(DB_PATH, 'utf8'))

const files = readdirSync(CONTRIB_DIR).filter(f => f.endsWith('.json') && f !== '.gitkeep')
if (files.length === 0) {
  console.log('No contributions to merge.')
  process.exit(0)
}

let added = 0
let updated = 0

for (const file of files) {
  const contrib = JSON.parse(readFileSync(`${CONTRIB_DIR}/${file}`, 'utf8'))
  for (const [barcode, record] of Object.entries(contrib)) {
    const isNew = !(barcode in db.products)
    db.products[barcode] = record
    if (isNew) added++; else updated++
  }
}

db.version += 1
db.generated = new Date().toISOString().slice(0, 10)

writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + '\n')

console.log(`Merged: +${added} new, ~${updated} updated → version ${db.version}`)
console.log(`Total products in DB: ${Object.keys(db.products).length}`)

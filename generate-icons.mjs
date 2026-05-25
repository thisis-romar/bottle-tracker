#!/usr/bin/env node
// Run: node generate-icons.mjs
// Requires: npm install -D sharp
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'

const svgBuffer = readFileSync('./public/icon.svg')
mkdirSync('./public', { recursive: true })

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

for (const { name, size } of sizes) {
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(`./public/${name}`)
  console.log(`Generated public/${name}`)
}
console.log('Done. Icons generated in public/')

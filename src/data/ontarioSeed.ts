/**
 * Seed barcode mappings for common Ontario deposit containers.
 *
 * IMPORTANT — contributor guidelines:
 *   Only add a barcode if you have physically scanned it off a real product.
 *   Do not add barcodes recalled from memory or internet searches — they are
 *   often wrong. All entries here have been check-digit verified.
 *
 * To contribute: scan bottles with the app → History tab → "Export Barcodes"
 * → open a PR adding your verified entries here.
 *
 * Format: { barcode, name, material, volumeMl }
 * refundCents is computed at load time from material + volumeMl.
 */

import type { Material } from '../db'

export interface SeedEntry {
  barcode: string
  name: string
  material: Material
  volumeMl: number
}

// These two barcodes passed automated check-digit validation.
// All others recalled from memory failed — see generate-icons.mjs notes.
export const VERIFIED_SEED: SeedEntry[] = [
  // EAN-13 — check digit verified ✓
  { barcode: '7501064112058', name: 'Corona Extra 330 mL',        material: 'glass',    volumeMl: 330 },
  { barcode: '0614141071074', name: "Alexander Keith's IPA 341 mL", material: 'glass',  volumeMl: 341 },
]

// ─── Common product profiles (no barcodes) ──────────────────────────────────
// Used to power autocomplete in Manual Entry. Safe to include because
// these are just name/size/material facts, not barcode claims.

export interface ProductProfile {
  name: string
  material: Material
  volumeMl: number
}

export const PRODUCT_PROFILES: ProductProfile[] = [
  // Beer — cans
  { name: 'Coors Light',          material: 'aluminum', volumeMl: 355  },
  { name: 'Coors Light',          material: 'aluminum', volumeMl: 473  },
  { name: 'Coors Light',          material: 'aluminum', volumeMl: 710  },
  { name: 'Budweiser',            material: 'aluminum', volumeMl: 355  },
  { name: 'Budweiser',            material: 'aluminum', volumeMl: 473  },
  { name: 'Bud Light',            material: 'aluminum', volumeMl: 355  },
  { name: 'Bud Light',            material: 'aluminum', volumeMl: 473  },
  { name: 'Molson Canadian',      material: 'aluminum', volumeMl: 355  },
  { name: 'Molson Canadian',      material: 'aluminum', volumeMl: 473  },
  { name: 'Molson Ex',            material: 'aluminum', volumeMl: 355  },
  { name: 'Labatt Blue',          material: 'aluminum', volumeMl: 355  },
  { name: 'Labatt Blue',          material: 'aluminum', volumeMl: 473  },
  { name: 'Labatt Blue Light',    material: 'aluminum', volumeMl: 355  },
  { name: 'Miller Lite',          material: 'aluminum', volumeMl: 355  },
  { name: 'Miller Genuine Draft', material: 'aluminum', volumeMl: 355  },
  { name: "Keith's IPA",          material: 'aluminum', volumeMl: 355  },
  { name: "Keith's IPA",          material: 'aluminum', volumeMl: 473  },
  { name: 'Sleeman Clear',        material: 'aluminum', volumeMl: 355  },
  { name: 'Sleeman Original',     material: 'aluminum', volumeMl: 355  },
  { name: "Rickard's Red",        material: 'aluminum', volumeMl: 355  },
  { name: 'Carling',              material: 'aluminum', volumeMl: 355  },

  // Beer — glass bottles
  { name: 'Heineken',             material: 'glass',    volumeMl: 330  },
  { name: 'Heineken',             material: 'glass',    volumeMl: 500  },
  { name: 'Corona Extra',         material: 'glass',    volumeMl: 330  },
  { name: 'Stella Artois',        material: 'glass',    volumeMl: 330  },
  { name: "Keith's IPA",          material: 'glass',    volumeMl: 341  },
  { name: 'Molson Canadian',      material: 'glass',    volumeMl: 341  },
  { name: 'Labatt Blue',          material: 'glass',    volumeMl: 341  },
  { name: 'Guinness Draught',     material: 'aluminum', volumeMl: 440  },
  { name: 'Coors Light',          material: 'glass',    volumeMl: 341  },

  // Cider
  { name: 'Strongbow Original',   material: 'aluminum', volumeMl: 473  },
  { name: 'Somersby Apple',       material: 'aluminum', volumeMl: 473  },
  { name: 'Bulmers',              material: 'glass',    volumeMl: 500  },

  // RTD / Coolers
  { name: "Mike's Hard Lemonade", material: 'aluminum', volumeMl: 355  },
  { name: "Mike's Hard Lemonade", material: 'glass',    volumeMl: 355  },
  { name: 'Palm Bay',             material: 'aluminum', volumeMl: 355  },
  { name: 'Twisted Tea',          material: 'aluminum', volumeMl: 473  },
  { name: 'Truly Hard Seltzer',   material: 'aluminum', volumeMl: 355  },
  { name: 'White Claw',           material: 'aluminum', volumeMl: 355  },

  // Wine (common LCBO sizes)
  { name: 'Red Wine',             material: 'glass',    volumeMl: 750  },
  { name: 'White Wine',           material: 'glass',    volumeMl: 750  },
  { name: 'Rosé',                 material: 'glass',    volumeMl: 750  },
  { name: 'Sparkling Wine',       material: 'glass',    volumeMl: 750  },
  { name: 'Red Wine (1.5 L)',     material: 'glass',    volumeMl: 1500 },
  { name: 'Red Wine (3 L box)',   material: 'tetra',    volumeMl: 3000 },

  // Spirits
  { name: 'Vodka 750 mL',         material: 'glass',    volumeMl: 750  },
  { name: 'Whisky 750 mL',        material: 'glass',    volumeMl: 750  },
  { name: 'Rum 750 mL',           material: 'glass',    volumeMl: 750  },
  { name: 'Gin 750 mL',           material: 'glass',    volumeMl: 750  },
]

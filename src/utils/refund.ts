import type { Material } from '../db'

/**
 * Ontario ODRP refund rules:
 * - Aluminum cans  ≤ 1000 mL → $0.10, > 1000 mL → $0.20
 * - All other (glass, plastic, tetra) ≤ 630 mL → $0.10, > 630 mL → $0.20
 */
export function calculateRefundCents(material: Material, volumeMl: number): 10 | 20 {
  if (material === 'aluminum') {
    return volumeMl <= 1000 ? 10 : 20
  }
  return volumeMl <= 630 ? 10 : 20
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function formatRefundCents(cents: 10 | 20): string {
  return cents === 10 ? '$0.10' : '$0.20'
}

/** Human-readable rule reminder shown in UI */
export function refundRuleLabel(material: Material): string {
  if (material === 'aluminum') return '≤1 L → $0.10 | >1 L → $0.20'
  return '≤630 mL → $0.10 | >630 mL → $0.20'
}

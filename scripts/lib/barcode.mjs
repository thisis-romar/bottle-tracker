/**
 * Shared barcode check-digit validation (UPC-A 12-digit, EAN-13 13-digit).
 * Used by both validate-contribution.mjs and profile-labels.ts so the rules
 * never drift between the contribution pipeline and the OCR profiler.
 */

export function upcCheckDigit(digits11) {
  const odds = [...digits11].slice(0, 11).filter((_, i) => i % 2 === 0).reduce((s, d) => s + +d, 0)
  const evens = [...digits11].slice(0, 11).filter((_, i) => i % 2 === 1).reduce((s, d) => s + +d, 0)
  return (10 - (odds * 3 + evens) % 10) % 10
}

export function ean13CheckDigit(digits12) {
  const total = [...digits12].slice(0, 12).reduce((s, d, i) => s + +d * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - total % 10) % 10
}

export function validateBarcode(bc) {
  if (!/^\d+$/.test(bc)) return { valid: false, reason: 'Non-numeric characters' }
  if (bc.length === 12) {
    const expected = upcCheckDigit(bc)
    const actual = +bc[11]
    if (expected !== actual) return { valid: false, reason: `UPC-A check digit fail: expected ${expected}, got ${actual}` }
    return { valid: true }
  }
  if (bc.length === 13) {
    const expected = ean13CheckDigit(bc)
    const actual = +bc[12]
    if (expected !== actual) return { valid: false, reason: `EAN-13 check digit fail: expected ${expected}, got ${actual}` }
    return { valid: true }
  }
  return { valid: false, reason: `Wrong length (${bc.length}): must be 12 (UPC-A) or 13 (EAN-13)` }
}

import { describe, it, expect } from 'vitest'
import { parseOcrText } from './ocr'

describe('parseOcrText', () => {
  it('reads volume, aluminum material, and abv from a typical can label', () => {
    const f = parseOcrText('STELLA ARTOIS\nBiere fine de luxe\n355 mL  5.0% alc./vol.\nRecyclable aluminium')
    expect(f.volumeMl).toBe(355)
    expect(f.material).toBe('aluminum')
    expect(f.abv).toBe(5)
  })

  it('handles comma decimals and "alc 4,6% vol" ordering', () => {
    const f = parseOcrText('Quelque biere  473 mL  alc 4,6% vol  CANETTE')
    expect(f.volumeMl).toBe(473)
    expect(f.material).toBe('aluminum')
    expect(f.abv).toBe(4.6)
  })

  it('prefers a known common size when multiple numbers appear', () => {
    // "100 Cal" and "2 g" are noise; 341 mL is the real volume.
    const f = parseOcrText('Keiths IPA 100 Cal 2 g carbs 341 mL bouteille 5% alc/vol')
    expect(f.volumeMl).toBe(341)
    expect(f.material).toBe('glass')
  })

  it('does not mistake "Canada"/"Canadian" for an aluminum can', () => {
    const f = parseOcrText('Molson Canadian Lager  Product of Canada  341 mL')
    expect(f.material).toBeUndefined()
    expect(f.volumeMl).toBe(341)
  })

  it('converts litres and reads PET plastic', () => {
    const f = parseOcrText('Spring Water 1.5 L PET bottle')
    expect(f.volumeMl).toBe(1500)
    expect(f.material).toBe('plastic')
  })

  it('returns an empty object when nothing is readable', () => {
    expect(parseOcrText('░░ blurry ░░ glare ░░')).toEqual({})
  })
})

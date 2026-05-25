import { describe, it, expect } from 'vitest'
import { reconcileFacts } from './reconcile'
import type { SourceResult } from './types'

function src(source: SourceResult['source'], facts: SourceResult['facts'], ok = true): SourceResult {
  return { source, facts, confidence: ok ? 0.8 : 0, ok }
}

describe('reconcileFacts', () => {
  it('marks agreement when sources match', () => {
    const r = reconcileFacts([
      src('localDb', { material: 'aluminum', volumeMl: 355 }),
      src('vision', { material: 'aluminum', volumeMl: 355 }),
    ])
    expect(r.material.value).toBe('aluminum')
    expect(r.material.conflict).toBe(false)
    expect([...r.material.sources].sort()).toEqual(['localDb', 'vision'])
    expect(r.volumeMl.value).toBe(355)
    expect(r.confidence).toBeGreaterThan(0.5)
  })

  it('flags conflict and picks the value backed by more sources', () => {
    const r = reconcileFacts([
      src('localDb', { volumeMl: 355 }),
      src('off', { volumeMl: 500 }),
      src('vision', { volumeMl: 355 }),
    ])
    expect(r.volumeMl.value).toBe(355) // 2 sources beat 1
    expect(r.volumeMl.conflict).toBe(true)
    expect([...r.volumeMl.sources].sort()).toEqual(['localDb', 'vision'])
    expect(r.volumeMl.others).toContainEqual({ source: 'off', value: 500 })
  })

  it('ignores not-ok sources and yields undefined when none provide a value', () => {
    const r = reconcileFacts([src('off', {}, false), src('lcbo', {}, false)])
    expect(r.name.value).toBeUndefined()
    expect(r.material.value).toBeUndefined()
    expect(r.confidence).toBe(0)
  })

  it('reconciles nutrition per field', () => {
    const r = reconcileFacts([
      src('off', { nutrition: { energyKcal: 145, carbsG: 11 } }),
      src('vision', { nutrition: { energyKcal: 145 } }),
    ])
    expect(r.nutrition.energyKcal.value).toBe(145)
    expect([...r.nutrition.energyKcal.sources].sort()).toEqual(['off', 'vision'])
    expect(r.nutrition.carbsG.value).toBe(11)
    expect(r.nutrition.carbsG.sources).toEqual(['off'])
  })

  it('treats blank strings as absent', () => {
    const r = reconcileFacts([
      src('localDb', { name: '   ' }),
      src('off', { name: 'Stella Artois' }),
    ])
    expect(r.name.value).toBe('Stella Artois')
    expect(r.name.sources).toEqual(['off'])
  })
})

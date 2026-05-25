import { describe, it, expect, vi, afterEach } from 'vitest'
import { lookupLcbo } from './lcbo'

afterEach(() => vi.restoreAllMocks())

function mockFetch(payload: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } }),
  ))
}

describe('lookupLcbo', () => {
  it('no name → not ok, no network', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const r = await lookupLcbo({ name: '  ', proxyUrl: 'https://x.workers.dev' })
    expect(r.ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('no proxy url → not ok, no network', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const r = await lookupLcbo({ name: 'Stella Artois', proxyUrl: '' })
    expect(r.ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('maps proxy response and parses volume/material from the product name', async () => {
    mockFetch({ ok: true, name: 'Stella Artois 6 x 330 mL bottle', producer: 'AB InBev' })
    const r = await lookupLcbo({ name: 'Stella', proxyUrl: 'https://x.workers.dev' })
    expect(r.ok).toBe(true)
    expect(r.facts.name).toContain('Stella')
    expect(r.facts.brand).toBe('AB InBev')
    expect(r.facts.volumeMl).toBe(330)
    expect(r.facts.material).toBe('glass')
  })

  it('aluminum can name → aluminum material', async () => {
    mockFetch({ ok: true, name: 'Steam Whistle Pilsner 473 mL can' })
    const r = await lookupLcbo({ name: 'Steam Whistle', proxyUrl: 'https://x.workers.dev' })
    expect(r.facts.volumeMl).toBe(473)
    expect(r.facts.material).toBe('aluminum')
  })

  it('hits the /lcbo route on the proxy origin', async () => {
    const spy = vi.fn(async (..._args: unknown[]) =>
      new Response(JSON.stringify({ ok: false, note: 'no match' }), { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await lookupLcbo({ name: 'zzz', proxyUrl: 'https://x.workers.dev/anthropic' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0][0])).toBe('https://x.workers.dev/lcbo?q=zzz')
  })

  it('upstream "no match" → graceful not ok', async () => {
    mockFetch({ ok: false, note: 'no match' })
    const r = await lookupLcbo({ name: 'nope', proxyUrl: 'https://x.workers.dev' })
    expect(r.ok).toBe(false)
    expect(r.note).toBe('no match')
  })
})

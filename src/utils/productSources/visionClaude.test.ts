import { describe, it, expect, vi, afterEach } from 'vitest'
import { claudeVisionExtract } from './visionClaude'

afterEach(() => vi.restoreAllMocks())

/** A minimal tool_use response so the extractor returns ok. */
function toolUseResponse() {
  return new Response(
    JSON.stringify({ content: [{ type: 'tool_use', name: 'extract_product', input: { volumeMl: 355 } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function captureFetch() {
  const spy = vi.fn(async (..._args: unknown[]) => toolUseResponse())
  vi.stubGlobal('fetch', spy)
  return spy
}

function headersOf(spy: ReturnType<typeof captureFetch>): Record<string, string> {
  const init = spy.mock.calls[0][1] as RequestInit
  return (init.headers ?? {}) as Record<string, string>
}

describe('claudeVisionExtract proxy secret', () => {
  it('sends x-proxy-secret when proxySecret is set', async () => {
    const spy = captureFetch()
    await claudeVisionExtract(new Blob(['x']), { endpoint: 'https://x.workers.dev', proxySecret: 's3cret' })
    expect(headersOf(spy)['x-proxy-secret']).toBe('s3cret')
  })

  it('omits x-proxy-secret when no secret is set', async () => {
    const spy = captureFetch()
    await claudeVisionExtract(new Blob(['x']), { endpoint: 'https://x.workers.dev' })
    expect(headersOf(spy)['x-proxy-secret']).toBeUndefined()
  })
})

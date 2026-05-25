/**
 * Bottle-tracker vision proxy (Cloudflare Worker).
 *
 * Holds the Anthropic API key server-side so the static PWA never sees it.
 * The PWA POSTs the exact Messages request body built by the app
 * (src/utils/productSources/visionClaude.ts) — including prompt-caching
 * `cache_control` blocks — and this Worker forwards it to Anthropic with the key.
 *
 * Setup:
 *   wrangler secret put ANTHROPIC_API_KEY     # required
 *   wrangler secret put PROXY_SECRET          # optional shared secret
 *   wrangler deploy
 * Then paste the Worker URL into the app: Settings → Can detail extraction → Proxy.
 */

export interface Env {
  ANTHROPIC_API_KEY: string
  /** Origin allowed to call this proxy, e.g. https://thisis-romar.github.io */
  ALLOWED_ORIGIN?: string
  /** Optional shared secret; if set, callers must send x-proxy-secret to match. */
  PROXY_SECRET?: string
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-proxy-secret',
    'access-control-max-age': '86400',
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowOrigin = env.ALLOWED_ORIGIN || '*'
    const cors = corsHeaders(allowOrigin)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors })
    }

    if (env.PROXY_SECRET && request.headers.get('x-proxy-secret') !== env.PROXY_SECRET) {
      return new Response('Forbidden', { status: 403, headers: cors })
    }
    if (!env.ANTHROPIC_API_KEY) {
      return new Response('Proxy missing ANTHROPIC_API_KEY', { status: 500, headers: cors })
    }

    let body: string
    try {
      body = JSON.stringify(await request.json())
    } catch {
      return new Response('Invalid JSON', { status: 400, headers: cors })
    }

    // Forward to Anthropic unchanged so cache_control (prompt caching) is preserved.
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body,
    })

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    })
  },
}

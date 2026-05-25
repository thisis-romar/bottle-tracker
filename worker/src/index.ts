/**
 * Bottle-tracker proxy (Cloudflare Worker). Two routes:
 *
 *   POST /          → forwards a Claude Messages request to Anthropic with the
 *                     server-side key (vision extraction). Body is passed through
 *                     unchanged so prompt-caching `cache_control` blocks survive.
 *   GET  /lcbo?q=   → name-search enrichment from the (unofficial) LCBO GraphQL API.
 *                     Browsers can't call it directly (CORS); this route does, and
 *                     normalises the result for src/utils/productSources/lcbo.ts.
 *
 * Setup:
 *   wrangler secret put ANTHROPIC_API_KEY     # required for vision
 *   wrangler secret put PROXY_SECRET          # optional shared secret (vision POST only)
 *   wrangler deploy
 * Then paste the Worker URL into the app: Settings → Can detail extraction → Proxy.
 * (The same URL powers /lcbo — the app derives it automatically.)
 */

export interface Env {
  ANTHROPIC_API_KEY: string
  /** Origin allowed to call this proxy, e.g. https://thisis-romar.github.io */
  ALLOWED_ORIGIN?: string
  /** Optional shared secret; if set, vision POST callers must send matching x-proxy-secret. */
  PROXY_SECRET?: string
  /** Override the LCBO GraphQL endpoint. Defaults to the community api.lcbo.dev. */
  LCBO_GRAPHQL_URL?: string
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_LCBO_URL = 'https://api.lcbo.dev/graphql'

function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-proxy-secret',
    'access-control-max-age': '86400',
  }
}

function json(obj: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

/**
 * Best-effort LCBO name search. The exact GraphQL shape of the unofficial
 * api.lcbo.dev isn't documented/verifiable, so the query + field mapping live
 * HERE in one place: if it errors, this returns the upstream error verbatim so
 * you can hit `/lcbo?q=beer` in a browser and adjust the query below to match.
 * The app degrades gracefully (the source just contributes nothing) until then.
 */
async function handleLcbo(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const q = (url.searchParams.get('q') || '').trim()
  if (!q) return json({ ok: false, note: 'missing q' }, 400, cors)

  const endpoint = env.LCBO_GRAPHQL_URL || DEFAULT_LCBO_URL
  const query = `query Search($q: String!) {
  products(search: $q, first: 3) {
    nodes { name producerName priceInCents }
  }
}`

  let data: any
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables: { q } }),
    })
    data = await r.json()
    if (!r.ok || data?.errors) {
      return json({ ok: false, note: 'lcbo upstream error', status: r.status, errors: data?.errors }, 200, cors)
    }
  } catch (e) {
    return json({ ok: false, note: `lcbo fetch failed: ${String(e)}` }, 200, cors)
  }

  const node = data?.data?.products?.nodes?.[0]
  if (!node?.name) return json({ ok: false, note: 'no match' }, 200, cors)
  return json({ ok: true, name: node.name, producer: node.producerName, priceCents: node.priceInCents }, 200, cors)
}

async function handleVision(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env.ALLOWED_ORIGIN || '*')
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method === 'GET' && url.pathname === '/lcbo') return handleLcbo(url, env, cors)
    if (request.method === 'POST') return handleVision(request, env, cors)

    return new Response('Method Not Allowed', { status: 405, headers: cors })
  },
}

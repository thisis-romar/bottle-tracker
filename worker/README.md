# Bottle-tracker proxy (Cloudflare Worker)

Optional serverless proxy with two routes:

- **`POST /`** — holds your Anthropic API key so the static PWA never exposes it, and
  forwards the same prompt-cached Messages request to Anthropic (vision extraction).
  Use this instead of bring-your-own-key when sharing the app or keeping keys off devices.
- **`GET /lcbo?q=<name>`** — name-search enrichment from the (unofficial) LCBO GraphQL
  API. The browser can't call it directly (CORS); this route can. Returns
  `{ ok, name, producer, priceCents }`.

## Deploy

```bash
cd worker
npm install -g wrangler          # or: npx wrangler ...
wrangler login

wrangler secret put ANTHROPIC_API_KEY   # paste your sk-ant-... key
wrangler secret put PROXY_SECRET        # optional; a random string

# Edit wrangler.toml → ALLOWED_ORIGIN to your Pages origin if different
wrangler deploy
```

`wrangler deploy` prints a URL like `https://bottle-tracker-vision-proxy.<you>.workers.dev`.

## Use it in the app

Open the app → **Settings → Can detail extraction → Proxy**, and paste the Worker URL.
If you set `PROXY_SECRET`, also enter the same value in the **Proxy secret** field there —
the app sends it as the `x-proxy-secret` header that the vision `POST /` route checks.

## LCBO route

`GET /lcbo?q=<name>` powers the **LCBO** cross-check source. The app derives it from the
same Worker URL you paste for vision, so no extra config is needed in the app.

LCBO publishes no official API; this queries the community `api.lcbo.dev` GraphQL endpoint.
Its exact schema isn't documented/verifiable, so the query + field mapping live in one place
(`handleLcbo` in `src/index.ts`). **Verify after deploying:** open
`https://<your-worker>.workers.dev/lcbo?q=beer` in a browser —

- `{ ok: true, name: ... }` → working.
- `{ ok: false, note: "lcbo upstream error", errors: [...] }` → the query needs adjusting
  to match the live schema (fix the `query`/field names in `handleLcbo`).
- Override the endpoint without code changes: `wrangler secret put LCBO_GRAPHQL_URL`.

## Notes
- CORS is restricted to `ALLOWED_ORIGIN`. `/lcbo` is public (no key spent, public data);
  `PROXY_SECRET` only gates the vision `POST /`.
- The Worker forwards the vision request body unchanged, so prompt-cache `cache_control`
  blocks set by the app are preserved.

# Vision proxy (Cloudflare Worker)

Optional serverless proxy that holds your Anthropic API key so the static PWA never
exposes it. Use this instead of bring-your-own-key when you want to share the app or
keep the key off devices.

The PWA sends the same prompt-cached Messages request it would send directly; this
Worker just adds the API key and forwards it to Anthropic.

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
(If you set `PROXY_SECRET`, the app currently doesn't send it — add an `x-proxy-secret`
header in `claudeVisionExtract` if you enable that check.)

## Notes
- CORS is restricted to `ALLOWED_ORIGIN`.
- The Worker forwards the request body unchanged, so prompt-cache `cache_control`
  blocks set by the app are preserved.

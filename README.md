# Ontario Bottle Return Tracker

[![CI](https://github.com/thisis-romar/bottle-tracker/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/thisis-romar/bottle-tracker/actions/workflows/ci.yml)

A local-first PWA for tracking Ontario ODRP deposit containers.
Runs offline, installs to your phone's home screen like a native app.

## Refund rules (Ontario ODRP)

| Container | ≤ threshold | > threshold |
|-----------|-------------|-------------|
| Aluminum cans | ≤ 1,000 mL → **$0.10** | > 1,000 mL → **$0.20** |
| Glass / Plastic / Tetra | ≤ 630 mL → **$0.10** | > 630 mL → **$0.20** |

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Start dev server (localhost only – camera works on http://localhost)
npm run dev

# 3. Open http://localhost:5173 in Chrome or Safari
```

## Build & install as PWA

PWA service worker only registers in **production builds**.

```bash
npm run build
npm run preview   # serves on http://localhost:4173
```

Then on your phone:
- **Android (Chrome):** tap the "Add to Home Screen" banner, or ⋮ → Install app
- **iOS (Safari):** Share → Add to Home Screen

> **Important for iOS:** Camera requires HTTPS. For local testing, use either:
> - `npm run preview -- --host` and access via your local IP (e.g. `https://192.168.x.x:4173`), or
> - Deploy to any HTTPS host (Vercel, Netlify, Cloudflare Pages — all free)

---

## PWA icons

Icons are already generated and committed (`public/icon-192.png`, `icon-512.png`,
`apple-touch-icon.png`). To regenerate after editing `public/icon.svg`:

```bash
npm install -D sharp       # one-time
node generate-icons.mjs    # rewrites the PNGs from icon.svg
npm run build              # rebuild to include them
```

---

## Deploy (GitHub Pages)

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds with the correct
`/bottle-tracker/` base path and publishes to:

**https://thisis-romar.github.io/bottle-tracker/**

One-time setup:
- **Settings → Pages → Source: "GitHub Actions"** to enable Pages.
- For Google Sheets export, add a repo **Variable** `VITE_GOOGLE_CLIENT_ID` and register the OAuth
  redirect URIs `https://thisis-romar.github.io/bottle-tracker/` and `http://localhost:5173/` in
  Google Cloud. See `.env.example`.

---

## Features

- **Scan** — camera barcode scanner using `@zxing/browser`
  - Beeps + vibrates on scan (both toggleable in Settings)
  - Flashlight/torch toggle for low-light scanning (where the camera supports it)
  - Debounces duplicate scans (2 s window)
  - Recognised barcodes (local + community DB) add instantly with no prompt
  - High-confidence Open Food Facts matches auto-add too, with an **Undo**; otherwise a
    bottom-sheet prompts for size/type once and saves it locally
- **Manual Entry** — searchable product quick-pick that auto-fills type/size/name, plus preset
  volumes, a quantity stepper, and a "Case of 24" shortcut
- **Current Bag** — live total, per-item quantity adjustment, **Fix** to correct an item (and its
  saved barcode mapping), CSV + Google Sheets export
- **History** — all saved returns, all-time total, per-session CSV + Google Sheets export
- **Settings** — sound/vibrate toggles, Google account connect for Sheets export, clear-all-data,
  and the can-detail cross-check controls (below)

### Product-detail cross-check (multi-source, optional)

When **Settings → "Cross-check can details"** is on, an *unknown* barcode triggers a parallel
lookup across multiple sources, reconciled field-by-field (agreement / conflict / nutrition shown
in the confirm sheet):

- **Community DB** — your local + `product-db.json` mappings.
- **Open Food Facts** — name/brand/size + best-effort nutrition (sparse for alcohol).
- **LCBO** — name-search enrichment (no barcode API exists) via the proxy's `/lcbo` route;
  runs once another source supplies a name. Uses the community `api.lcbo.dev` — see
  [worker/README.md](./worker/README.md) to verify/adjust the query after deploy.
- **Photo (Claude vision)** — reads the can label for product/size/ABV/nutrition.

Vision backend is chosen at runtime in Settings:

| Mode | What it does | Setup |
|------|--------------|-------|
| **Mock** | No extraction — wiring/testing only | none |
| **My key (BYO)** | Calls Claude directly from the browser | paste an Anthropic API key (stored only on-device) |
| **Proxy** | Calls a serverless proxy that holds the key | deploy `worker/` (see [worker/README.md](./worker/README.md)), paste its URL |

Pick the model (**Haiku / Sonnet / Opus**), hit **🧪 Test extraction** to verify a key/proxy without
scanning, and use **🔁 Re-check details** to re-run the cross-check on the last added item. Requests
use prompt caching on the static instruction/schema so repeat calls in a scanning burst stay cheap.

## Data model

All data is stored locally in **IndexedDB** via [Dexie](https://dexie.org/).
Nothing leaves your device.

```
ContainerItem  { id, barcode?, name?, material, volumeMl, quantity, refundCents, scannedAt, sessionKey }
Session        { id, sessionKey, startedAt, finishedAt?, totalItems, totalRefundCents, note? }
BarcodeMapping { barcode, name?, material, volumeMl, refundCents, updatedAt }
```

## Development

```bash
npm install
npm run dev      # dev server
npm run build    # tsc typecheck + vite build
npm test         # vitest (unit tests, e.g. the multi-source reconciler)
```

CI (`.github/workflows/ci.yml`) runs build + tests on every push and PR.

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the current plan and priorities.

**Done**
- [x] Google Sheets export (PKCE OAuth, no client secret)
- [x] Shared community barcode database (`product-db.json` + GitHub contribution workflow)
- [x] UPC product lookup via Open Food Facts
- [x] Multi-source product cross-check (Community DB + OFF + LCBO stub + Claude vision), with
      runtime BYO-key/proxy and a Haiku/Sonnet/Opus selector

**Planned**
- [ ] Larger verified Ontario catalog (barcode-first auto-fill)
- [ ] Cloud sync / user accounts
- [ ] Multi-bag / draft sessions

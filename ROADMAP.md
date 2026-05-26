# Roadmap

Priorities: **ship and start using it**, then **automate data entry** (barcode-first, then
camera OCR). AI photo-classification and bulk-quantity tooling come later.

## Deposit rules (verified)

The refund logic in `src/utils/refund.ts` matches the official Ontario Deposit Return Program:

| Container | 10¢ | 20¢ |
|-----------|-----|-----|
| Glass / PET / Tetra Pak / bag-in-box | ≤ 630 mL | > 630 mL |
| Aluminum / steel cans | ≤ 1 L | > 1 L |

(Containers ≤ 100 mL are deposit-exempt — not yet modelled; rare for alcohol.)

## Phase 0 — Ship & use it

- [x] Fix PWA manifest paths so the installed app works under the `/bottle-tracker/` base.
- [x] Correct the mislabeled `062067382215` barcode (was "Bud Light", is Stella Artois).
- [x] Flashlight/torch toggle in the scanner for low-light scanning.
- [x] Generate PWA icons (generated and committed to `public/`).
- [x] Create `main` branch + enable GitHub Pages (Source: GitHub Actions).
- [ ] Set `VITE_GOOGLE_CLIENT_ID` as a repo Variable and inject it into the deploy build.
- [ ] Google Cloud: enable Sheets + Drive APIs, create a Web OAuth client, add redirect URIs
      `http://localhost:5173/` and `https://thisis-romar.github.io/bottle-tracker/`.

## Phase 1 — Automate entry I: barcode-first catalog

Refund auto-derives from type + size; quantity auto-increments on repeat scan. Targets type + size.

- [x] Manual Entry product quick-pick (auto-fills type/size/name) + expanded `PRODUCT_PROFILES`
      in `src/data/ontarioSeed.ts`.
- [x] Zero-tap add on confident lookups (local/community DB; high-confidence Open Food Facts
      matches auto-add with an Undo).
- [x] "Fix"/report action to correct an item and its saved barcode mapping (reuses the GitHub
      contribution workflow), fixing mislabels like the Stella/Bud Light mix-up.
- [ ] Ongoing: grow the *verified barcode* catalog (`public/product-db.json`) from real scans /
      user-submitted photos — can't be fabricated.

## Phase 1.5 — Multi-source cross-check + on-can vision  ✅

- [x] Pluggable `productSources/` pipeline: Community DB + Open Food Facts (now incl. nutrition) +
      LCBO stub + on-can vision, reconciled field-by-field (`reconcile.ts`, unit-tested).
- [x] Capture a still frame and show per-source agreement/conflict + nutrition in the confirm sheet.
- [x] Real Claude vision (tool-use + prompt caching) with runtime backend choice — bring-your-own-key
      or a Cloudflare Worker proxy (`worker/`) — and a Haiku/Sonnet/Opus selector + Test button.
- [x] "Re-check details" to re-validate the last added item; tap-to-focus for close-up cans.
- [x] CI (`.github/workflows/ci.yml`) runs build + vitest on push/PR.
- [x] Real LCBO enrichment: two-phase pipeline feeds a derived name to a proxy `/lcbo` route
      (community `api.lcbo.dev`); volume/material parsed from the result, graceful no-op on failure.

## Phase 2 — Automate entry II: camera OCR fallback  ✅

- [x] On-device OCR fallback (Tesseract.js — no API key, offline) as an opt-in source
      (`productSources/ocr.ts`), runs on the captured frame when a barcode is unknown; works
      with the AI cross-check off.
- [x] Parse size with the existing `parseVolume()` plus conservative material/ABV regexes
      (`parseOcrText`, unit-tested), pre-filling the confirm sheet via the reconcile pipeline.
- [x] OCR assets (~19 MB) bundled & served from the app, excluded from the install precache and
      runtime-cached on first use (`vite.config.ts`), so the PWA install stays small.

## Later

- AI photo classification (vision model → product/type/size; needs API key + network).
- Faster bulk quantity (scan-once-set-N, +N stepper) for boxes of identical containers.
- Cloud sync, user accounts, multi-bag/draft sessions.

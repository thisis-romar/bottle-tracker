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
- [ ] Generate PWA icons (`npm i -D sharp && node generate-icons.mjs`) — done at deploy time.
- [ ] Create `main` branch + enable GitHub Pages (Settings → Pages → Source: GitHub Actions).
- [ ] Set `VITE_GOOGLE_CLIENT_ID` as a repo Variable and inject it into the deploy build.
- [ ] Google Cloud: enable Sheets + Drive APIs, create a Web OAuth client, add redirect URIs
      `http://localhost:5173/` and `https://thisis-romar.github.io/bottle-tracker/`.

## Phase 1 — Automate entry I: barcode-first catalog

Refund auto-derives from type + size; quantity auto-increments on repeat scan. Targets type + size.

- [ ] Grow the verified catalog (`public/product-db.json`, `PRODUCT_PROFILES` in
      `src/data/ontarioSeed.ts`) with common Ontario beer/cooler/wine/spirit SKUs.
- [ ] Zero-tap add on confident lookups (skip the modal when type + size are known).
- [ ] "Report wrong mapping" action (reuse the existing GitHub contribution workflow) so
      mislabels like the Stella/Bud Light mix-up get corrected.

## Phase 2 — Automate entry II: camera OCR fallback

- [ ] When a barcode is unknown, OCR a video frame on-device (no API key, offline).
- [ ] Parse size with the existing `parseVolume()` and infer material with `parseMaterial()`,
      then pre-fill the unknown-barcode sheet so the user just confirms.

## Later

- AI photo classification (vision model → product/type/size; needs API key + network).
- Faster bulk quantity (scan-once-set-N, +N stepper) for boxes of identical containers.
- Cloud sync, user accounts, multi-bag/draft sessions.

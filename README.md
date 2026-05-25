# Ontario Bottle Return Tracker

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

## Generate PWA icons (optional)

```bash
npm install -D sharp       # one-time
node generate-icons.mjs    # creates public/icon-192.png, icon-512.png, apple-touch-icon.png
npm run build              # rebuild to include icons
```

Without icons the PWA still works; browsers use a default icon.

---

## Features

- **Scan** — camera barcode scanner using `@zxing/browser`
  - Beeps + vibrates on scan (both toggleable in Settings)
  - Flashlight/torch toggle for low-light scanning (where the camera supports it)
  - Debounces duplicate scans (2 s window)
  - Unknown barcodes: bottom-sheet prompts for size/type once, saved locally
- **Manual Entry** — preset volumes + quantity stepper + "Case of 24" shortcut
- **Current Bag** — live total, per-item quantity adjustment, CSV export
- **History** — all saved returns, all-time total, per-session CSV export

## Data model

All data is stored locally in **IndexedDB** via [Dexie](https://dexie.org/).
Nothing leaves your device.

```
ContainerItem  { id, barcode?, name?, material, volumeMl, quantity, refundCents, scannedAt, sessionKey }
Session        { id, sessionKey, startedAt, finishedAt?, totalItems, totalRefundCents, note? }
BarcodeMapping { barcode, name?, material, volumeMl, refundCents, updatedAt }
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the current plan and priorities.

**Done**
- [x] Google Sheets export (PKCE OAuth, no client secret)
- [x] Shared community barcode database (`product-db.json` + GitHub contribution workflow)
- [x] UPC product lookup via Open Food Facts

**Planned**
- [ ] Larger verified Ontario catalog (barcode-first auto-fill)
- [ ] Camera OCR fallback to read size off the label when a barcode is unknown
- [ ] Cloud sync / user accounts
- [ ] Multi-bag / draft sessions

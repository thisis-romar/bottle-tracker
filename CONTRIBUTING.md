# Contributing Barcodes

The Ontario Bottle Tracker gets better every time someone scans a bottle.
This guide explains the two ways to contribute verified barcodes back to the community database.

---

## Method 1 — In-app contribute button (recommended)

1. Scan any bottle the app doesn't recognise
2. Confirm the product details in the bottom sheet
3. Tap **"Contribute →"** in the green prompt that appears after saving
4. A GitHub issue opens pre-filled with your data — submit it
5. Automated check-digit validation runs instantly
6. A PR is auto-generated if valid; merged by a maintainer
7. All connected apps update silently on next load

> Requires `VITE_CONTRIBUTE_URL` to be set in your `.env.local` — see `.env.example`.

---

## Method 2 — Direct Pull Request

For bulk contributions or corrections to existing entries:

1. Edit `public/product-db.json` directly
2. Add your entries to the `"products"` object:

```json
"062067382215": {
  "name": "Stella Artois 355 mL",
  "brand": "Stella Artois",
  "brewer": "Labatt",
  "material": "aluminum",
  "volumeMl": 355,
  "abv": 5.0,
  "type": "beer",
  "verifiedBy": "photo-scan",
  "addedDate": "2026-05-25"
}
```

3. Run the validator locally to check your barcodes:

```bash
# Single barcode check
node -e "
  const bc = '062067382215'
  const odds  = [...bc.slice(0,11)].filter((_,i)=>i%2===0).reduce((s,d)=>s+ +d,0)
  const evens = [...bc.slice(0,11)].filter((_,i)=>i%2===1).reduce((s,d)=>s+ +d,0)
  const cd = (10-(odds*3+evens)%10)%10
  console.log(cd === +bc[11] ? '✓ valid' : '✗ invalid — expected ' + cd)
"
```

> The snippet above only checks **UPC-A (12-digit)** codes. **EAN-13 (13-digit)** codes use a
> different weighting, so this one-liner will wrongly reject them. The CI validator
> (`scripts/validate-contribution.mjs`) handles both lengths — opening a PR is the safest way to
> validate a 13-digit barcode.

4. Increment `"version"` by 1 in `product-db.json`
5. Open a PR — CI will validate all check digits

---

## Rules

| Rule | Why |
|---|---|
| Physical scan only | Recalled barcodes from memory are almost always wrong (failed check digits in 13/13 test cases) |
| Ontario products only | Other provinces have different deposit rules |
| Volume must match the container | Volume drives the $0.10 vs $0.20 threshold |
| One barcode = one SKU | 355 mL and 473 mL of the same brand are different barcodes |

---

## Exporting your local database

If you've been using the app for a while, you've built up a personal barcode database.
Export it via **History → Export Barcode DB** and use it as a source for PR contributions.

---

## What happens after merge

1. `product-db.json` version is incremented
2. The static file is deployed to GitHub Pages automatically
3. On next app load, `useProductDb()` detects the version bump
4. New entries are merged into each user's IndexedDB silently
5. Those barcodes scan instantly for everyone from that point on

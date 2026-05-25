# Contributions staging area

JSON files in this directory are created automatically by the
`validate-contribution.mjs` script when processing GitHub issues labeled
`barcode-contribution`.

The `merge-contributions.mjs` script reads all `.json` files here and
merges them into `../public/product-db.json`, then this directory is
cleaned up as part of the same PR.

Do not manually add files here — use the GitHub Issues template instead.

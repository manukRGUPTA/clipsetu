# Clipsetu

Clipsetu is a static prototype for India-focused clipping campaigns, clip review, verified-versus-reported metrics, and manual payout records.

## Demo safety

- This prototype has no server, authentication, or shared database. Demo records stay in the current browser's local storage.
- Never enter real UPI IDs, bank details, identity data, payment references, or receipts. Use fake demo values only.
- Recording a payout does not transfer money. Receipt previews are temporary in the current browser session and are not uploaded.
- Views are not fetched from social platforms; a human reviewer enters verified counts.
- The sample creator campaign is generic and remains a draft until its source and payout rules are complete.

## Run

Open `index.html` directly or serve this folder with any static web server. No package installation or build step is required.

## Smoke check

Run `node tests/smoke.mjs` to validate the inline JavaScript and basic public-demo safety markers.

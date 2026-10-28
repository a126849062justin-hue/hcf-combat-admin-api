# Growth reporting rollout — 2026-10-28

This repository is the production source for the existing hcf-admin Render service. The website repository contains a backend reference copy, but Render deploys this repository at its root.

The dashboard now separates martial-arts signup operations from visual-design inquiry clicks, with source groups, booking steps and shark recommendations. New event parameters are allowlisted; personal answers, health details and receipt identifiers are not accepted as growth dimensions. These are operation counts, not unique visitors or attributed conversion rates. Opening LINE does not establish a sent message or confirmed booking. No historical backfill.

Authenticated staff can enter daily totals for confirmations, attendance/consultations and sales per brand. Saving the same date and brand updates that row. The existing key-value storage contains these aggregates under `outcomes`, included in existing export/import. No schema migration is required. The separate booking APP remains the destination for bookings.

Existing LINE webhook and lead notifications, content editor, LV.3 selection, credentials and service settings are preserved. `/api/health` exposes only `{ok:true,version:"20261027"}` for rollout verification.

Validation: `node --test tests/*.cjs`; server and inline admin script syntax checks; diff whitespace check. Tests use a temporary local data directory with LINE credentials disabled, including legacy lead/content flows. No synthetic leads or metrics are submitted to production.

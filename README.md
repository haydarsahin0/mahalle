# Dijital Arsam 🌱

A Turkey-wide digital land game on real maps. Replaces the former Mahalle mini-world while preserving its source and old demo save.

## Implemented

- MapLibre GPU-rendered map with OpenFreeMap streets, city/district/neighborhood labels and switchable Esri satellite imagery.
- Full-country overview, zoom to street scale (up to zoom 20, imagery overzoomed from 18), pan, bearing, pitch, scale and attribution.
- Local search across **81 provinces and 973 districts**, shortcuts to eight locations, and `latitude, longitude` search. Neighborhoods are visible where the basemap supplies labels; neighborhood-name search is not implemented.
- Stable geographic grid IDs at 0.002° spacing. Cells are generated only in the visible viewport at zoom 13+, capped at 2,200 candidates. Approximate area is calculated on a sphere.
- A bundled Natural Earth Turkey polygon excludes foreign territory and most sea cells. This generalized boundary is not cadastral and does not exclude every inland lake, road, existing building or small coastline intersection.
- Simulated agricultural, 2/3/5-floor residential and mixed commercial zoning, with deterministic district-level generation.
- Prices reflect fictional zoning and proximity to the game's city centers; no real property price feed.
- Rumors are explicitly fictional and unconfirmed. Scheduled in-game planning decisions can approve or reject rezoning; rumors do not grant early build rights.
- Demo week advancement; server mode uses a shared UTC week clock. Confirmed rezoning changes build permissions and game valuation.
- Buy, build, upgrade within permitted floors, list/unlist and purchase listed land. Farm use on fields, residential buildings on zoned land, cafés/shops/fuel only on commercial land.
- Portfolio, map parcel selection, filters, confirmation dialogs, demo credit top-ups and persistent browser demo state.

## Current mode

Without `VITE_API_URL`, the public build is a **free local demo** with 15,000 credits. Other players do not see that browser's trades. Old `mahalle-demo-v1` saves are preserved separately; the new key is `dijital-arsam-v2`.

All parcels, zoning, floor limits, rumors and prices are game data. The real map does not imply real ownership, planning permission or investment value.

## Run

Node 22:

```sh
npm ci
npm run dev
npm test
npm run build
```

GitHub Actions publishes `dist` to GitHub Pages on `main`. The repository name and Pages URL remain `mahalle`; the product name is Dijital Arsam. No repository rename is required.

## Shared world / Stripe

The Express/PostgreSQL server is prepared but requires an HTTPS deployment and database. Copy `.env.example` into the server environment. Set `DATABASE_URL`, `CLIENT_ORIGIN`, `CLIENT_URL`. Run `npm run server`. Set the repository variable `VITE_API_URL` to the deployed HTTPS API origin and rebuild.

V2 uses a new `digital_world` table and `digital_activity` ledger. The legacy world remains untouched. Existing accounts and balances are preserved. The server uses the same geographic and zoning rules as the client. It locks the shared world row, checks ownership and funds, then commits buyer debit, seller credit and property transfer together. A server week cannot be set by the browser. This serialized JSON-world approach suits a prototype; production scale requires row-per-parcel ownership and spatial indexing.

Stripe Checkout integration remains server-only. The example is €5 for 1,000 non-redeemable credits. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as server secrets. Webhook URL: `/stripe/webhook`, events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`. Only a verified paid event credits a balance; session IDs prevent duplicate credits. Never place secret keys in `VITE_` variables or git. No Stripe account or keys are connected by this release.

Player sales are settled in game credits. Real-money payouts/Stripe Connect, refunds/chargeback tools, email verification, password recovery and production monitoring remain unimplemented. Test database concurrency and Stripe test webhooks before a paid public launch.

## Data and availability

See [data sources](public/data/SOURCES.md). No tiles or satellite imagery are downloaded into the repo. Live map access needs internet; imagery quality varies by region and zoom. Attribution remains visible. The bundled search works without geocoder requests. Provider terms and service capacity must be confirmed for a paid launch.

## Verification

`npm test`: legacy five tests plus seven geographic/zoning tests cover reproducible cells, foreign/water rejection, ownership, funds, build restrictions, floor caps, seller transfer metadata, positive and negative rumor outcomes, viewport caps and 81-province data integrity.

The production build is verified. Live browser checks and deployment status are recorded in the delivery message. Server database and live Stripe integration have not been exercised without deployment credentials.

## Files

- `src/land.js`: geographic parcels and shared game rules.
- `src/map.js`: real map layers and parcel rendering.
- `src/main.js`, `src/style.css`: responsive Turkish UI.
- `public/data/`: local Turkey boundary, province/district search records and sources.
- `server/`: shared world, accounts, transactional trades, Stripe adapter.
- `src/game.js`, `src/world.js`: preserved legacy mini-world rules and 3D models.

# Dijital Arsam 🌱

A Turkey-wide digital land game on real maps. Replaces the former Mahalle mini-world while preserving its source and old demo save.

## Implemented

- MapLibre GPU-rendered map with OpenFreeMap streets, city/district/neighborhood labels and switchable Esri satellite imagery.
- Full-country overview, zoom to street scale (up to zoom 20, imagery overzoomed from 18), pan, bearing, pitch, scale and attribution.
- Local search across **81 provinces and 973 districts**, shortcuts to eight locations, and `latitude, longitude` search. Neighborhoods are visible where the basemap supplies labels; neighborhood-name search is not implemented.
- Irregular parcels instead of a uniform grid. Each 0.002° block is a jittered polygon whose corner and edge vertices are derived from their own coordinates, so neighbouring blocks share them exactly; the block is then recursively cut into plots. Cuts produce triangles, quadrilaterals, many-sided and notched non-convex shapes, and plot sizes vary within and between blocks. Parcels tile their block exactly (verified in tests), so no land is left unassigned. Stable IDs are `TR-<x>-<y>-<index>`. Parcels are generated only in the visible viewport at zoom 14+, bounded to 900 blocks and 3,600 parcels per view.
- **Parcels exist on land only.** The bundled boundary is the OpenStreetMap-derived geoBoundaries TUR ADM0 outline simplified to ~20 m — finer than a parcel — and coastal parcels are cut against it: a parcel that straddles the shore keeps its land part and loses the rest, a parcel wholly at sea is never created, and land right up to the water stays covered. Where the shoreline is too intricate to cut cleanly (more than one shore chain through one parcel, or an islet inside it) the parcel is dropped instead of guessed, which can leave a small unassigned sliver on such coasts. Islands are included; foreign territory is excluded.
- No parcel is placed on a mapped lake or reservoir (56 water bodies). That layer is ~1 km-scale Natural Earth data, so lake shores are far less precise than the coastline, and small lakes, rivers and seasonal water are not covered.
- Zoning is derived from real published data, not from the grid: Natural Earth built-up footprints, Natural Earth lakes, and TÜİK-derived population and area for all 973 districts joined to their real coordinates. A parcel inside a built-up footprint — or within a settlement radius estimated from its district's population at ~4,000 residents per built-up km² — counts as **arsa (imarlı)**; further out it stays **tarla/arazi (imarsız)**. Floor limits follow the district's real size and density: 5-floor and commercial plans only appear in districts that are actually large and dense, small towns top out lower, and remote farmland gets no building rights at all.
- Parcel size follows the same data: city blocks divide into many small plots (median ≈ 1,700 m² in central Ankara) while farmland stays in a few large fields (median ≈ 3 ha on the Konya plain).
- Prices are per square metre and scale with the same real figures (district population, how built-up the spot is, the plan on the parcel), so a large field and a small city plot are priced differently. Game credits only; no real property price feed.
- Rezoning rumours only appear where they are plausible — on farmland right at the edge of a real built-up area. Remote farmland is never rezoned. Scheduled in-game planning decisions can approve or reject; rumours never grant early build rights and are explicitly fictional.
- Demo week advancement; server mode uses a shared UTC week clock. Confirmed rezoning changes build permissions and game valuation.
- Buy, build, upgrade within permitted floors, list/unlist and purchase listed land. Farm use on fields, residential buildings on zoned land, cafés/shops/fuel only on commercial land.
- Portfolio, map parcel selection, filters, confirmation dialogs, demo credit top-ups and persistent browser demo state.

## Current mode

Without `VITE_API_URL`, the public build is a **free local demo** with 15,000 credits. Other players do not see that browser's trades. Old `mahalle-demo-v1` saves are preserved separately. The parcel layout changed with this release, so parcel IDs from the old uniform grid no longer resolve; the demo key moved from `dijital-arsam-v2` to `dijital-arsam-v3` and earlier holdings are not carried over.

Parcel shapes are generated, and zoning, floor limits, rumours and prices are the game's own model on top of published settlement data. None of it is a title record or a municipal development plan (imar planı), and none of it implies real ownership, planning permission or investment value.

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

V3 keeps the `digital_world` table and `digital_activity` ledger; a stored world older than version 3 is reset on boot because parcel IDs changed. The server loads the same `landuse.json` as the client, so both sides compute identical zoning. The legacy world remains untouched. Existing accounts and balances are preserved. The server uses the same geographic and zoning rules as the client. It locks the shared world row, checks ownership and funds, then commits buyer debit, seller credit and property transfer together. A server week cannot be set by the browser. This serialized JSON-world approach suits a prototype; production scale requires row-per-parcel ownership and spatial indexing.

Stripe Checkout integration remains server-only. The example is €5 for 1,000 non-redeemable credits. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as server secrets. Webhook URL: `/stripe/webhook`, events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`. Only a verified paid event credits a balance; session IDs prevent duplicate credits. Never place secret keys in `VITE_` variables or git. No Stripe account or keys are connected by this release.

Player sales are settled in game credits. Real-money payouts/Stripe Connect, refunds/chargeback tools, email verification, password recovery and production monitoring remain unimplemented. Test database concurrency and Stripe test webhooks before a paid public launch.

## Data and availability

See [data sources](public/data/SOURCES.md). No tiles or satellite imagery are downloaded into the repo. Live map access needs internet; imagery quality varies by region and zoom. Attribution remains visible. The bundled search works without geocoder requests. Provider terms and service capacity must be confirmed for a paid launch.

## Verification

`npm test`: legacy five tests plus eleven geographic/zoning tests cover reproducible IDs, foreign/water rejection, gap-free tiling (parcel areas summing to their block, shared block vertices, one owning parcel per point), shape and size variety, data-driven zoning and pricing, ownership, funds, build restrictions, floor caps, seller transfer metadata, fringe-only rezoning with positive and negative outcomes, viewport caps, 81-province and 973-district data integrity.

The production build is verified. Live browser checks and deployment status are recorded in the delivery message. Server database and live Stripe integration have not been exercised without deployment credentials.

## Files

- `src/land.js`: parcel generation, zoning and shared game rules.
- `src/geometry.js`: polygon maths, deterministic polygon cutting and the latitude-banded point-in-polygon index.
- `src/landuse.js`: real built-up areas, lakes and district records behind every zoning decision.
- `src/map.js`: real map layers and parcel rendering.
- `src/main.js`, `src/style.css`: responsive Turkish UI.
- `public/data/`: local Turkey boundary, province/district search records, real built-up/lake/district land-use data and sources.
- `server/`: shared world, accounts, transactional trades, Stripe adapter.
- `src/game.js`, `src/world.js`: preserved legacy mini-world rules and 3D models.

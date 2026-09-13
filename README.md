# Dijital Arsam 🌱

A Turkey-wide digital land game on real maps, running on Supabase with Stripe payments. Replaces the former Mahalle mini-world while preserving its source and old demo save.

## Implemented

- MapLibre GPU-rendered map with OpenFreeMap streets, city/district/neighborhood labels and switchable Esri satellite imagery.
- Full-country overview, zoom to street scale (up to zoom 20, imagery overzoomed from 18), pan, bearing, pitch, scale and attribution.
- Local search across **81 provinces and 973 districts**, shortcuts to eight locations, and `latitude, longitude` search. Neighborhoods are visible where the basemap supplies labels; neighborhood-name search is not implemented.
- Irregular parcels instead of a uniform grid. Each 0.002° block is a jittered polygon whose corner and edge vertices are derived from their own coordinates, so neighbouring blocks share them exactly; the block is then recursively cut into plots. Cuts produce triangles, quadrilaterals, many-sided and notched non-convex shapes, and plot sizes vary within and between blocks. Parcels tile their block exactly (verified in tests), so no land is left unassigned. Stable IDs are `TR-<x>-<y>-<index>`. Parcels are generated only in the visible viewport at zoom 14+, bounded to 900 blocks and 3,600 parcels per view.
- **Parcels exist on land only.** The bundled boundary is the OpenStreetMap-derived geoBoundaries TUR ADM0 outline simplified to ~20 m — finer than a parcel — and coastal parcels are cut against it: a parcel that straddles the shore keeps its land part and loses the rest, a parcel wholly at sea is never created, and land right up to the water stays covered. Where the shoreline is too intricate to cut cleanly (more than one shore chain through one parcel, or an islet inside it) the parcel is dropped instead of guessed, which can leave a small unassigned sliver on such coasts. Islands are included; foreign territory is excluded.
- No parcel is placed on a mapped lake or reservoir (56 water bodies). That layer is ~1 km-scale Natural Earth data, so lake shores are far less precise than the coastline, and small lakes, rivers and seasonal water are not covered.
- Zoning is derived from real published data, not from the grid: Natural Earth built-up footprints, Natural Earth lakes, and TÜİK-derived population and area for all 973 districts joined to their real coordinates. A parcel inside a built-up footprint — or within a settlement radius estimated from its district's population at ~4,000 residents per built-up km² — counts as **arsa (imarlı)**; further out it stays **tarla/arazi (imarsız)**. Floor limits follow the district's real size and density: 5-floor and commercial plans only appear in districts that are actually large and dense, small towns top out lower, and remote farmland gets no building rights at all.
- Parcel size follows the same data: city blocks divide into many small plots (median ≈ 1,700 m² in central Ankara) while farmland stays in a few large fields (median ≈ 3 ha on the Konya plain).
- **One jeton is one Turkish lira, and land starts at ten kuruş a square metre.** Remote farmland is priced at exactly ₺0.10/m²; everything else is a multiple of that floor, driven by the same real figures (district population and density, how built-up the spot is, the plan on the parcel) and topping out around ₺0.73/m² in the densest central districts. So a 1,000 m² field is ₺100, a 1,300 m² plot in central Ankara about ₺990. Building costs sit in the same scale: a farm plot is 25 jetons, a house 60, a fuel station 160, and each extra floor 45 × the current level.
- Rezoning rumours only appear where they are plausible — on farmland right at the edge of a real built-up area. Remote farmland is never rezoned. Scheduled in-game planning decisions can approve or reject; rumours never grant early build rights and are explicitly fictional.
- Demo week advancement; server mode uses a shared UTC week clock. Confirmed rezoning changes build permissions and game valuation.
- Buy, build, upgrade within permitted floors, list/unlist and purchase listed land. Farm use on fields, residential buildings on zoned land, cafés/shops/fuel only on commercial land.
- Portfolio, map parcel selection, filters, confirmation dialogs, Supabase email/password accounts, and a jeton wallet with a quick-buy panel that sends the player straight to Stripe Checkout.

## Accounts, jetons and money

There is no offline demo any more. The map, the parcels and their prices are open to everyone without an account; buying, building and selling need a Supabase account, and a new account starts at **0 jetons**. Jetons are bought with real money through Stripe Checkout in Turkish lira:

| Paket | Ödeme | Jeton | Avantaj |
| --- | --- | --- | --- |
| Başlangıç | ₺100 | 100 | 1 ₺ = 1 jeton |
| Avantajlı | ₺400 | 500 | +%25 jeton |
| Yatırımcı | ₺999 | 1.200 | +%20 jeton |

Per lira the middle pack is the best deal in this list (1.25 jeton/₺ against 1.20 for the largest); ₺999 → 1,300 jetons would put them in order if that was the intent.

Jetons are game credit: they buy parcels inside the game, they are transferred between players when a listing sells, and they are never redeemable for money. Parcel shapes are generated, and zoning, floor limits, rumours and prices are the game's own model on top of published settlement data — not a title record, not a municipal development plan (imar planı), and no implication of real ownership, planning permission or investment value.

Selling virtual goods for real money in Türkiye brings obligations this repository does not implement: distance-selling terms, right-of-withdrawal wording for digital goods, VAT handling, invoicing and a refund policy. Stripe also does not currently accept businesses established in Türkiye, so the account behind `STRIPE_SECRET_KEY` has to be one Stripe supports (or the payment step has to move to a local provider such as iyzico or PayTR). Neither is code work — but neither should be skipped before taking money.

## Run

Node 22:

```sh
npm ci
npm run dev
npm test
npm run build
```

GitHub Actions publishes `dist` to GitHub Pages on `main`. The repository name and Pages URL remain `mahalle`; the product name is Dijital Arsam. No repository rename is required.

## Supabase backend

The Express/PostgreSQL server is gone. Auth, data and payments now run on Supabase:

- `supabase/migrations/` — `profiles`, `parcels`, `payments`, `activity`, row level security, and the two SECURITY DEFINER functions that own every balance change. A parcel row exists only once someone has bought it; shape, zoning and price are derived from the bundled map data on both sides instead of being stored.
- `supabase/functions/action` — one entry point for buy/build/upgrade/list/unlist. It re-derives the parcel from the map data, enforces zoning, computes the price itself and then calls `commit_action`. Numbers coming from the browser are never trusted; a listed parcel sells for exactly what its owner set.
- `supabase/functions/checkout` — creates a Stripe Checkout session in TRY for one pack.
- `supabase/functions/stripe-webhook` — the only place jetons are created. It verifies the Stripe signature, checks the session is paid, in lira and priced exactly like a real pack, then credits once; the session id is the primary key, so a replayed event is a no-op.

Row level security: the map (`parcels`) is world-readable, a player reads only their own profile, payments and activity, and no table grants insert/update/delete to `anon` or `authenticated` at all. Because the price has to be an argument to `commit_action` (only JavaScript can derive it from the map data), execute on both writer functions is granted to `service_role` alone — a signed-in browser calling the RPC directly would otherwise name its own price. The edge functions verify the caller's JWT with the anon key and then write with the service role key, which never leaves Supabase. The anon key in the built site is safe to publish.

### Setup

```sh
npm ci
npm run sync                       # copy the shared rules into supabase/functions/_shared
supabase link --project-ref <ref>
supabase db push                   # applies supabase/migrations
supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... \
  CLIENT_URL=https://haydarsahin0.github.io/mahalle/ CLIENT_ORIGIN=https://haydarsahin0.github.io
supabase functions deploy action checkout
supabase functions deploy stripe-webhook --no-verify-jwt   # Stripe calls it, not a browser
```

In Stripe, add the webhook endpoint `https://<ref>.supabase.co/functions/v1/stripe-webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and copy its signing secret into `STRIPE_WEBHOOK_SECRET`. In Supabase Auth, decide whether email confirmation stays on (the sign-up screen already tells players to confirm). Finally set the repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` so GitHub Pages builds with the backend wired in; without them the published site is browse-only.

`npm run sync` keeps `supabase/functions/_shared` identical to `src/`, and `npm test` fails if the copies drift, so the rules the server prices with are the rules the browser draws.

## Data and availability

See [data sources](public/data/SOURCES.md). No tiles or satellite imagery are downloaded into the repo. Live map access needs internet; imagery quality varies by region and zoom. Attribution remains visible. The bundled search works without geocoder requests. Provider terms and service capacity must be confirmed for a paid launch.

## Verification

`npm test`: legacy five tests plus fifteen geographic, zoning and money tests cover reproducible IDs, foreign/water rejection, gap-free tiling (parcel areas summing to their block, shared block vertices, one owning parcel per point), shape and size variety, data-driven zoning and pricing, ownership, funds, build restrictions, floor caps, seller transfer metadata, fringe-only rezoning with positive and negative outcomes, viewport caps, 81-province and 973-district data integrity, the ten-kuruş floor, the jeton pack price list, and that the edge functions ship byte-identical rules to the browser.

`npm run db:test` runs `supabase/tests/money.test.sql` against a scratch Postgres (set `DATABASE_URL`): it asserts a new account starts at zero, that a Stripe session credits exactly once, that funds and ownership are enforced, that a listing cannot be bought below its price, that floor limits hold, that seller and buyer balances move together, and that row level security hides another player's balance. Verified here on PostgreSQL 16.

`npm run functions:test` drives the webhook handler under Deno: unsigned and forged signatures are rejected, a tampered amount, an unpaid session and an unknown pack credit nothing, and only a genuine event reaches the crediting call. Verified with Deno 2.1.4; the three functions also pass `deno check` against the real Stripe and Supabase SDKs.

Not verified here: a live Supabase project, a real Stripe payment, and the deployed edge functions. Those need the account credentials and should be exercised with Stripe test cards before taking real money.

The production build is verified. Live browser checks and deployment status are recorded in the delivery message. Server database and live Stripe integration have not been exercised without deployment credentials.

## Files

- `src/land.js`: parcel generation, zoning, pricing and shared game rules.
- `src/api.js`: Supabase auth, world reads and the calls into the edge functions.
- `src/packs.js`: the jeton price list, shared by the wallet screen and Stripe checkout.
- `src/geometry.js`: polygon maths, deterministic polygon cutting and the latitude-banded point-in-polygon index.
- `src/landuse.js`: real built-up areas, lakes and district records behind every zoning decision.
- `src/map.js`: real map layers and parcel rendering.
- `src/main.js`, `src/style.css`: responsive Turkish UI.
- `public/data/`: local Turkey boundary, province/district search records, real built-up/lake/district land-use data and sources.
- `supabase/`: migrations, edge functions and the database and webhook tests.
- `src/game.js`, `src/world.js`: preserved legacy mini-world rules and 3D models.

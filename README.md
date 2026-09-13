# mahalle 🌱

A small place for big dreams: a pastel 3D neighborhood browser game, built with Three.js and Vite. Turkish interface, responsive layout, original procedural 3D models.

## Current release

The default GitHub Pages build is a **free, clearly labeled local demo**. Everyone can view the neighborhood without signing in. Demo ownership, balance and listings are stored only in that browser. The shared-world server is implemented separately; it needs deployment and configuration before real multiplayer or payments can work.

### Playable features

- Orbit, pan, zoom, reset and rotate the 3D world; day/evening lighting; animation pause.
- Houses, farms, cafés and fuel stations, modeled in code with gardens, verandas and fences.
- Cows, chickens, pedestrians, cyclists and cars moving through the scene.
- Select plots on the 3D map or in an accessible list; filter land/buildings.
- Location-based plot prices, purchases, construction, five upgrade levels through skyscrapers.
- Listing creation/removal, buying a listed neighbor property, owned-property view.
- Connected expansion: purchasing vacant land exposes one new adjoining plot.
- 7,500 starting demo credits; free top-ups and an explicit reset confirmation.
- No accounts or real payments in demo mode.

## Develop

Node.js 22 recommended.

```sh
npm ci
npm run dev
npm test
npm run build
```

## GitHub Pages

`.github/workflows/pages.yml` builds and publishes on pushes to `main`. In repository **Settings → Pages → Build and deployment**, choose **GitHub Actions** if Pages has not yet been enabled. The workflow attempts automatic enablement; GitHub may require the owner to enable Pages first because the workflow token lacks repository administration permission.

The intended project address is `https://haydarsahin0.github.io/mahalle/`. The Vite base is relative, so assets also work at other subpaths.

Leave repository variable `VITE_API_URL` unset for demo mode. After deploying the API, set it to the HTTPS API origin and rerun the Pages workflow.

## Shared world + Stripe server

`server/index.js` is an Express/PostgreSQL API. `server/schema.sql` initializes its tables on startup. Ownership and balances are authoritative on the server. A transaction locks the world row before purchasing, building or listing; buyer debit, seller credit, property transfer and connected expansion commit together. The browser cannot supply prices for purchases or upgrades.

1. Provision PostgreSQL and an HTTPS Node.js service with persistent database storage.
2. Copy `.env.example` to `.env` in the **server environment**, and fill `DATABASE_URL`, `CLIENT_ORIGIN`, `CLIENT_URL`.
3. Start with `npm ci --omit=dev` and `npm run server`. `/health` verifies the database connection.
4. Start with Stripe **test-mode** keys. Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as server secrets, never in frontend variables or git.
5. Register the HTTPS endpoint `/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
6. Set frontend `VITE_API_URL` and rebuild. Visitors now read the same server world; signed-in users can own properties. The client refreshes shared state every 15 seconds.
7. Verify test checkout, webhook retry, purchase concurrency and seller credit against a staging database before enabling live payments.

The example package costs **€5 for 1,000 non-redeemable in-game credits**. Checkout sessions use server-defined amounts. Only a signature-verified, paid Stripe webhook credits the account. The payment session ID is unique, so retries cannot credit it twice. A success redirect does not credit a balance. Keys are not included in this repository and no Stripe account was connected during implementation.

Player-to-player sales use in-game credits. **Real-money seller payouts / Stripe Connect are not implemented.** Credits cannot be cashed out. Account email verification, password recovery, chargeback/refund administration and production monitoring are not included yet. These are needed before a public paid launch.

API endpoints: `GET /world`, `GET /health`, `POST /auth/register`, `POST /auth/login`, `GET /me`, `POST /logout`, `POST /action`, `POST /checkout`, `POST /stripe/webhook`.

The seeded neighbors are demo/system properties, not fabricated live users. The initial shared world uses the same small map. New accounts begin with zero credits; there is no client-controlled credit endpoint on the server.

## Verification

Initial local and GitHub Actions builds and all five game-rule tests passed. GitHub Pages enablement was blocked with `Resource not accessible by integration`; the owner must choose GitHub Actions under Settings → Pages. Visual browser QA is pending because the available browser could not open the local development URL and Pages is not yet enabled.

`npm test` checks connected growth, insufficient-balance rejection, ownership, upgrade limits, listing validation and listed-property transfers. The frontend production build is checked separately. Server integration tests require a PostgreSQL test database and Stripe test configuration; do not interpret the unit tests as live-payment validation.

## Project files

- `src/world.js` — Three.js world, original procedural models and animation.
- `src/game.js` — world seed, price rules, demo state transitions.
- `src/main.js` — UI, interaction and API adapter.
- `src/style.css` — pastel desktop/mobile interface.
- `server/` — shared-state and payment API.
- `tests/` — game-rule regression tests.

Font files are requested from Google Fonts with local sans-serif fallbacks. Geometry is generated locally; the game does not rely on a remote model CDN.

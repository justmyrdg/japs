# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow preference

Edit files directly in place by default. Do NOT create git branches, worktrees, commits, pushes, or pull requests unless the user explicitly asks for one of those specifically in their current request. Assume plain, direct edits to the working tree are always welcome without asking first.

## Project overview

A bus transport management system ("JAPS") with an Express/Sequelize/PostgreSQL API in `server/` and an Angular 21 SPA in `client/`. Roles: `owner`, `secretary`, `audit_teller`, `conductor`, `driver`.

## Commands

Run from `server/`:
- `npm run dev` — start API with auto-restart (`node --watch index.js`), port from `PORT` env (default 3000)
- `npm start` — start API without watch
- `npm run seed:owner` — seed an initial owner account (`scripts/createOwner.js`)
- No test suite is configured yet.

Run from `client/`:
- `npm start` — `ng serve --port 2736 --host 0.0.0.0` (dev server on port 2736, not Angular's default 4200)
- `npm run build` — production build to `dist/`
- `npm run watch` — dev build with watch
- `npm test` — unit tests via Vitest (`ng test`)
- To run a single test file: `ng test -- <path-or-pattern>` (Vitest runner)

There is no root-level script — `client` and `server` are independent npm projects; run commands from within each directory.

## Architecture

### Server (`server/`)

- `index.js` is the entrypoint: wires CORS (credentials on, origin from `CLIENT_URL`), `express.json()`, `cookie-parser`, mounts all route modules under `/api/*`, then calls `sequelize.authenticate()` → `sequelize.sync({ alter: true })` before listening. Sequelize `alter: true` means schema changes are auto-applied on boot from the model definitions — no separate migration files.
- Config: `config/database.js` builds the Sequelize instance from `DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_HOST`/`DB_PORT` env vars (Postgres).
- Auth: `middleware/auth.js` exports `authenticate` (verifies JWT from the httpOnly `token` cookie, sets `req.user`) and `authorize(...roles)` (checks `req.user.role`). JWTs are issued in `controllers/authController.js` on login and carry `{ id, employee_id, role }`; a role→landing-page map (`ROLE_REDIRECT`) decides where the client redirects after login. Route files apply `authenticate`/`authorize` per-endpoint — check the relevant `routes/*.js` before assuming an endpoint is protected.
- Models live in `models/*.js`, each exporting a `(sequelize) => sequelize.define(...)` factory (all use `underscored: true` + `timestamps: true`, explicit `tableName`). **All associations are centralized in `models/index.js`** — this is the single place to look to understand how entities relate (User ↔ Trip/Remittance, BusModel ↔ Trip/Remittance/crew, Route ↔ Trip/FareRate, Trip ↔ PassengerCount/Ticket, Remittance ↔ Trip/RemittanceExpense). When adding a model, define it in its own file, `require` it in `models/index.js`, declare associations there, and add it to the `module.exports`.
- Controllers are grouped by domain/role (`busController`, `conductorController`, `driverController`, `auditTellerController`, `routeController`, `fareSettingsController`, `userController`), matching one route file each.
- Core domain flow: a `Trip` belongs to a `BusModel`, `Route`, driver, and conductor; it accumulates `PassengerCount`/`Ticket` records and eventually attaches to a `Remittance` (a bus/crew's cash turnover for a period), which owner/audit-teller review and approve (`Remittance.approved_by`) and which can carry `RemittanceExpense` line items.

### Client (`client/`)

- Angular 21, standalone components (no NgModules), signal-based state (see `AuthService` using `signal<AuthUser | null>`).
- Routing is role-based and lazy-loaded: `app.routes.ts` defines top-level paths per role (`owner`, `conductor`, `driver`, `audit-teller`), each `loadChildren`-ing its own `<role>.routes.ts` under `features/<role>/`. Add new role-scoped pages inside that role's feature folder and route file, not in `app.routes.ts` directly.
- `core/guards/auth.guard.ts` and `role.guard.ts` gate route access; `core/interceptors/auth.interceptor.ts` handles HTTP-level auth concerns (e.g. attaching credentials / handling 401s).
- `AuthService` (`core/services/auth.service.ts`) keeps the authenticated user only in memory (a signal) — deliberately never persisted to localStorage/sessionStorage. Auth state is re-established via `fetchMe()` against `/api/auth/me`, which relies on the httpOnly cookie set by the server. Login only sets the cookie; the client re-fetches `me` afterward rather than trusting the login response body for user data.
- `shared/` holds cross-feature `components`, `constants`, and `models` (e.g. `auth.models.ts` defines `AuthUser`/`LoginResponse` shared with `AuthService`).
- `environments/environment.ts` provides `apiUrl` used to build API base URLs (e.g. `AuthService.API`).
- Styling uses Tailwind CSS v4 (via `@tailwindcss/postcss`) plus `primeicons`.

## Conventions worth knowing

- Server code uses tabs for indentation in some files (e.g. `middleware/auth.js`) and 2-space in others (e.g. models) — match the surrounding file, not a single global style.
- Cookies are httpOnly, `sameSite: "strict"`, `secure` only in production, 8h expiry by default (`JWT_EXPIRES_IN` env override) — mirror `COOKIE_OPTIONS` in `authController.js` if adding new cookie-setting code.
- `server/.env` and `server/node_modules` are present locally but are expected to be gitignored/untracked — don't assume `.env` values are safe to commit or share.

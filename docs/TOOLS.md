# Tools & Technologies

An inventory of the languages, frameworks, and libraries used across JAPS: what each one *is*, where it's wired up, and what it's for in this project.

## Languages

| Language | Used in | What it is / what it's for |
|---|---|---|
| SQL | Generated/executed under the hood by Sequelize against PostgreSQL — not hand-written anywhere in the repo | Structured Query Language — the standard language relational databases understand for creating tables and reading/writing rows. Sequelize translates model calls (e.g. `Trip.findAll()`) into SQL statements so nobody writes it by hand here. |
| JavaScript | All of `server/**/*.js` | A dynamically-typed scripting language. Originally browser-only, but Node.js lets it run on a server — that's what the entire backend is written in. |
| TypeScript | All of `client/src/**/*.ts` | A superset of JavaScript that adds static types (interfaces, generics, compile-time checks). It compiles down to plain JavaScript before it ever reaches a browser — Angular is built on it and requires it. |
| HTML | Every `*.html` in `client/src/app/**` | HyperText Markup Language — defines the structure/content of a page (what elements exist: buttons, tables, inputs). Each Angular component has its own `.html` template. |
| CSS | Every `*.css` in `client/src/app/**`, `client/src/styles.css` | Cascading Style Sheets — controls the visual presentation of HTML (layout, color, spacing). Here it's written mostly as Tailwind utility classes rather than custom rules. |

## 🗄️ Database

> ### **PostgreSQL**
> An open-source relational (SQL) database — the single datastore for the entire system, no other database is used.
> - Accessed exclusively through **Sequelize** (`^6.37.8`) as the ORM, via the **pg** (`^8.22.0`) driver.
> - Connection built in `server/config/database.js` from `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT` env vars.
> - Schema is **not migration-based** — `sequelize.sync({ alter: true })` runs on every server boot and auto-applies model changes directly to the schema.
> - Currently provisioned on **Render** (see `server/.env.render`); models live in `server/models/*.js` with all associations centralized in `server/models/index.js`.

## Backend (`server/`)

| Tool | Version | Used in | What it is / what it's for |
|---|---|---|---|
| Node.js | — | `server/index.js` (entrypoint) | A JavaScript runtime built on Chrome's V8 engine that lets JS execute outside a browser — e.g. as a server. Started via `npm start` or `npm run dev` (`--watch` for auto-restart). |
| Express | ^5.2.1 | `server/index.js`, all `server/routes/*.js` | A minimal, unopinionated web framework for Node.js that provides routing and a middleware pipeline for building HTTP APIs. `index.js` wires middleware and mounts every route module under `/api/*`. |
| **Sequelize** | **^6.37.8** | `server/config/database.js`, `server/models/*.js` | A promise-based **ORM (Object-Relational Mapper)** — lets JS code define models/associations and query them (`.findAll()`, `.create()`) instead of writing raw SQL. Models define tables; `models/index.js` centralizes associations. |
| **pg** | **^8.22.0** | `server/config/database.js` (loaded by Sequelize) | The official low-level **PostgreSQL client driver** for Node.js — the thing that actually opens the TCP connection and speaks Postgres's wire protocol; Sequelize sits on top of it. |
| jsonwebtoken | ^9.0.3 | `server/controllers/authController.js` (sign), `server/middleware/auth.js` (verify) | Implements **JWT (JSON Web Token)** — a compact, digitally-signed token format for stateless authentication. Used to issue/verify the token stored in the httpOnly `token` cookie; payload carries `{ id, employee_id, role }`. |
| bcrypt | ^6.0.0 | `server/controllers/authController.js`, `server/controllers/userController.js` | A password-hashing library implementing the **bcrypt** algorithm, deliberately slow and salted so stolen password hashes are hard to brute-force. |
| cookie-parser | ^1.4.7 | `server/index.js` | Express middleware that parses the raw `Cookie` request header into a usable `req.cookies` object, so `middleware/auth.js` can read the auth cookie. |
| cors | ^2.8.6 | `server/index.js` | Express middleware implementing **CORS (Cross-Origin Resource Sharing)** — the browser security mechanism that decides which origins are allowed to call this API. Configured with credentials enabled, origin restricted to `CLIENT_URL`. |
| dotenv | ^17.4.2 | `server/index.js` (loaded first, before config) | Loads key/value pairs from a `.env` file into `process.env`, keeping secrets (DB credentials, JWT secret, `CLIENT_URL`, `PORT`) out of source code. |
| @types/cookie-parser (dev) | ^1.4.10 | editor/tooling only | A TypeScript type-declaration package — gives editors type info for `cookie-parser`'s API even though the server itself is plain JS (`type: "commonjs"`), not TypeScript. |

No test runner is configured on the backend.

## Frontend (`client/`)

| Tool | Version | Used in | What it is / what it's for |
|---|---|---|---|
| Angular | ^21.2.0 (`core`, `common`, `compiler`, `forms`, `platform-browser`, `router`) | `client/src/app/**` (all components/services), `app.routes.ts` | A full-featured frontend framework (by Google) for building single-page applications — includes components, routing, forms, and dependency injection out of the box. This app uses standalone components (no NgModules) and signal-based state (e.g. `core/services/auth.service.ts`). |
| Angular CLI / @angular/build | ^21.2.5 | `client/angular.json` | The official command-line tooling for Angular — scaffolds code and drives the dev server (`ng serve`, port 2736), production builds (`ng build`), and watch builds. |
| TypeScript | ~5.9.2 | `client/tsconfig*.json`, all `.ts` files | See Languages section above — the language every Angular file in this app is written in. |
| RxJS | ~7.8.0 | Angular `HttpClient` calls throughout `core/services/*` and feature pages | **R**eactive E**x**tensions for **J**avaScript — a library for composing asynchronous, event-based code as observable streams instead of callbacks/promises. Angular's `HttpClient` and router are built on it. |
| Tailwind CSS (v4) + @tailwindcss/postcss | ^4.1.12 | `client/.postcssrc.json`, `client/src/styles.css`, every feature `.css` file (e.g. `features/conductor/pages/dashboard/dashboard.css`) | A utility-first CSS framework — instead of writing custom CSS rules, you compose small pre-made classes (`flex`, `pt-4`, `text-sm`) directly in markup. |
| PostCSS | ^8.5.3 | `client/.postcssrc.json` | A tool for transforming CSS using JS plugins (e.g. autoprefixing, or running the Tailwind plugin) as part of the build pipeline. |
| PrimeIcons | ^7.0.0 | Feature `.html` templates (e.g. `features/audit-teller/pages/dashboard/dashboard.html`, `auth/login-page/login-page.html`) via `pi pi-*` classes | An open-source icon font/CSS library — each icon is just a CSS class, no SVG imports needed. |
| Vitest | ^4.0.8 | `client/angular.json` (`test` builder: `@angular/build:unit-test`) | A fast unit-test framework (built on Vite, Jest-compatible API). Runs via `ng test`, replacing Angular's older Karma/Jasmine default. |
| jsdom (dev) | ^28.0.0 | Vitest test environment (via Angular's test builder) | A pure-JS implementation of browser standards (DOM, HTML) — lets tests exercise components' DOM behavior in Node without launching a real browser. |
| Prettier (dev) | ^3.8.1 | `client/.prettierrc` | An opinionated code formatter that automatically enforces one consistent style (spacing, quotes, line length) across the codebase. |
| tslib | ^2.3.0 | compiled build output (implicit) | A small runtime library holding helper functions the TypeScript compiler emits (e.g. for `async`/`await`, decorators) — avoids duplicating that boilerplate in every compiled file. |

## Infrastructure / Deployment

| Layer | Provider | Notes |
|---|---|---|
| Frontend | **Vercel** | Hosts the built Angular SPA (`client/` → `npm run build` → `dist/`). |
| Backend (API) | **Render** | Hosts the Express server (`server/`). |
| Database | **Render** | Managed PostgreSQL instance (see `server/.env.render` for connection details). |
| Domain / DNS | **GoDaddy** | Domain name registered here; DNS records point the domain/subdomains at the Vercel and Render deployments. |

- **Cookies** — httpOnly, `sameSite: "strict"`, `secure` in production, used as the sole auth transport (no localStorage/sessionStorage tokens). Since the frontend (Vercel) and backend (Render) are on different hosts, the auth cookie must be set with a domain/`sameSite` config that supports cross-site requests between them (or both placed under the same GoDaddy-managed domain via subdomains, e.g. `app.example.com` + `api.example.com`, to keep cookies first-party) — worth confirming `COOKIE_OPTIONS` in `authController.js` and `CLIENT_URL`/CORS config match whichever setup is chosen.

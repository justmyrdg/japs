# Conductor Bluetooth Printer Setup — Design

Date: 2026-07-16
Status: Approved for planning

## Problem

Conductors print fare tickets from the Ticketing page (`client/src/app/features/conductor/pages/ticketing/`) on handheld Bluetooth thermal receipt printers (generic 58mm/80mm, budget hardware). Today the only print path is the browser's native `window.print()` dialog, which does not talk to these printers directly.

The desired feature: before a conductor can use the Ticketing page, the system should ensure a Bluetooth printer is connected/ready, and printing tickets should go straight to that printer instead of (or in addition to) the browser print dialog.

## Constraint that shapes this design

Generic Bluetooth thermal printers of this class use **Bluetooth Classic (SPP)**, not BLE. The Web Bluetooth API — the only Bluetooth access available to a mobile browser (Chrome/Android) — only supports **BLE**. It cannot scan, pair, or send data to an SPP device. This rules out building custom in-app "scan and pair" UI in the web app itself, now or without a native rewrite.

The product is planned to support both web and native long-term, but web is first. Given that, and given the printer hardware is fixed (budget SPP printers), the only viable near-term path is to delegate the actual Bluetooth pairing and data transmission to an already-installed bridge app, rather than reimplementing Bluetooth handling ourselves.

## Chosen approach: RawBT bridge

[RawBT](https://www.rawbt.ru/) (or an equivalent Android Bluetooth print-bridge app) is installed once on the conductor's phone, outside our system. RawBT owns:
- Bluetooth SPP device scanning and pairing (its own native UI)
- Receiving print jobs via an Android intent / custom URL scheme
- Sending formatted receipt data to the paired printer

Our web app's responsibilities are limited to:
1. Confirming the bridge is present and a test print succeeds, before unlocking ticketing.
2. Formatting ticket data into a print payload and invoking RawBT's intent/URL scheme when a ticket is issued.

We do **not** implement Bluetooth scanning, pairing, or SPP/ESC-POS device communication ourselves.

## Scope of the gate

Only the **Ticketing page** (`conductor/ticketing`) requires a confirmed printer setup. The rest of the conductor portal (trip dashboard, ticket history, remittances) remains accessible without one, since printing is the only feature that depends on it.

## Storage: device-local only

Printer setup status is stored in the browser's `localStorage` on the conductor's phone — **not** synced to the backend or tied to the user account. This matches physical reality: RawBT's pairing lives on that specific device. A conductor logging in on a different phone has a different (unpaired) RawBT install and must redo setup there; treating this as account-level state would incorrectly report "configured" on a new device that isn't.

No backend/API/database changes are part of this feature.

## Components

### 1. `PrinterSetupService` (new — `client/src/app/core/services/printer-setup.service.ts`)

- Signal-based service, matching the pattern used by `AuthService` (in-memory signal, backed by persistence — here `localStorage` instead of a cookie/API).
- `isConfigured(): boolean` — reads/exposes whether setup has been completed on this device.
- `markConfigured(): void` — called after a successful test print; writes to `localStorage` and updates the signal.
- `reset(): void` — clears the flag (exposed on the setup page as a "Reconfigure printer" action, e.g. if the conductor switches printers).
- `buildReceiptText(ticket): string` — shared formatting helper used by both the test print and real ticket prints, so the test print exercises the exact code path production printing uses.
- `sendToPrinter(text: string): void` — invokes the RawBT intent/URL scheme with the given text. Used by both the setup page's test print and the ticketing page's real print.

### 2. `printerSetupGuard` (new — `client/src/app/core/guards/printer-setup.guard.ts`)

- `CanActivateFn`, following the existing `authGuard`/`roleGuard` pattern.
- Applied only to the `ticketing` child route in `conductor.routes.ts`.
- If `PrinterSetupService.isConfigured()` is false, redirects to `conductor/printer-setup` (preserving the original destination is not needed — the setup page always returns to `conductor/ticketing` on success).

### 3. `PrinterSetupPage` (new — `client/src/app/features/conductor/pages/printer-setup/`)

- New route `printer-setup` under `CONDUCTOR_ROUTES`, loaded the same lazy-standalone way as existing pages.
- Content:
  - Short instructions and a link to install RawBT (Play Store link) if not already installed.
  - "Send Test Print" button — builds a sample receipt via `PrinterSetupService.buildReceiptText()` and sends it via `sendToPrinter()`.
  - Confirmation controls: since the browser cannot reliably detect whether the intent succeeded or RawBT is even installed, the page asks the conductor to confirm the physical result ("Did the test receipt print? Yes / No"). "Yes" calls `markConfigured()` and navigates to `conductor/ticketing`. "No" shows troubleshooting copy (reinstall link, check printer power/pairing in RawBT) and lets them retry.
  - A visible timeout-driven hint ("Nothing happened? Make sure RawBT is installed") shown a few seconds after tapping test print, since a missing app fails the intent silently rather than raising a JS error.
- Reachable directly (e.g. from a "Reconfigure printer" link) even after setup is complete, not just via the guard redirect.

### 4. Ticketing page changes (`client/src/app/features/conductor/pages/ticketing/ticketing.ts`)

- On successful ticket creation (existing `printTicketSubmit()` success branch), call `PrinterSetupService.sendToPrinter(buildReceiptText(...))` instead of relying solely on `triggerBrowserPrint()`.
- Keep `triggerBrowserPrint()` (`window.print()`) as a secondary, manually-triggered fallback button in the existing print modal, for cases where a conductor needs a paper copy from a laptop/desktop or the Bluetooth send visibly failed.
- No changes to the existing HTTP call to `/api/conductor/trips/:id/tickets` — this is purely a client-side print-path change.

### 5. Routing change (`client/src/app/features/conductor/conductor.routes.ts`)

- Add `printer-setup` route (no guard beyond the existing `authGuard`/`roleGuard('conductor')` at the parent level).
- Add `printerSetupGuard` to the `ticketing` route's `canActivate`.

## Error handling

- Intent-not-opening (RawBT missing) is not detectable via a JS callback/error — handled via the visible timeout hint described above, not a try/catch.
- Test print failure due to printer being off/out of range is handled by the manual Yes/No confirmation on the setup page, since RawBT does not reliably report job status back to the browser.
- If `sendToPrinter()` is called from the ticketing page and the conductor never explicitly disables it, a failed silent print simply means the physical ticket didn't come out; the existing success alert ("Ticket generated and sent to printing terminal") already covers this ambiguity in wording and needs no change, but the fallback print button remains available in the same modal so the conductor has a recovery path without re-issuing the ticket.

## Testing

- Unit tests for `PrinterSetupService` (localStorage read/write, signal updates) using Vitest, following existing client test conventions.
- Unit tests for `printerSetupGuard` (redirect behavior based on service state), mirroring how `auth.guard` would be tested.
- Manual verification: real device + RawBT + a physical Bluetooth thermal printer, since the intent hand-off and physical print output cannot be exercised in an automated test.

## Out of scope

- Any in-browser Bluetooth device scanning/pairing UI (blocked by the Web Bluetooth/BLE-only limitation).
- Native app work (Capacitor or otherwise) — noted as a future direction in the original ask, not part of this feature.
- Backend/API changes — this feature is entirely client-side.
- Support for BLE-capable printers via Web Bluetooth directly — could be a later addition if/when such hardware is adopted, but is not needed for the current SPP printer fleet.

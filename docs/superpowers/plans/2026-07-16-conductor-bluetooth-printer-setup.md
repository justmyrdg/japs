# Conductor Bluetooth Printer Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require conductors to confirm a Bluetooth thermal printer (via the RawBT bridge app) is working before they can use the Ticketing page, and route real ticket prints through that same bridge instead of only the browser print dialog.

**Architecture:** Client-side only (Angular). A new `PrinterSetupService` tracks device-local setup state in `localStorage` and knows how to format/send receipt text to RawBT via its intent URL scheme. A new `printerSetupGuard` blocks the `conductor/ticketing` route until setup is confirmed, redirecting to a new `PrinterSetupPage`. The existing `ticketing.ts` is updated to send real tickets through the same `sendToPrinter()` path used by the setup page's test print.

**Tech Stack:** Angular 21 (standalone components, signals), Vitest for unit tests, RawBT Android app (external, invoked via `rawbt:` URL scheme) — no backend changes.

## Global Constraints

- No backend/API/database changes — this feature is entirely client-side (per spec "Out of scope").
- Printer setup status is stored in `localStorage` only, never synced to the backend or tied to the user account (per spec "Storage: device-local only").
- The gate (`printerSetupGuard`) applies **only** to the `conductor/ticketing` route, not the rest of the conductor portal (per spec "Scope of the gate").
- `window.print()` (`triggerBrowserPrint()`) must remain available as a manual fallback button in the existing print modal, not be removed (per spec "Ticketing page changes").
- No in-browser Bluetooth scanning/pairing (Web Bluetooth) — all real printing goes through RawBT's intent/URL scheme (per spec "Chosen approach").

---

## File Structure

- `client/src/app/core/services/printer-setup.service.ts` (new) — signal-based service: `localStorage`-backed configured flag, receipt text formatting, and RawBT intent invocation. One responsibility: printer setup state + print dispatch.
- `client/src/app/core/services/printer-setup.service.spec.ts` (new) — unit tests for the service.
- `client/src/app/core/guards/printer-setup.guard.ts` (new) — `CanActivateFn` gating the ticketing route.
- `client/src/app/core/guards/printer-setup.guard.spec.ts` (new) — unit tests for the guard.
- `client/src/app/features/conductor/pages/printer-setup/printer-setup.ts` (new) — standalone component: instructions, test print button, Yes/No confirmation.
- `client/src/app/features/conductor/pages/printer-setup/printer-setup.html` (new) — template for the above.
- `client/src/app/features/conductor/pages/printer-setup/printer-setup.css` (new) — empty/minimal, matching sibling pages' pattern (Tailwind utility classes live in the template).
- `client/src/app/features/conductor/pages/printer-setup/printer-setup.spec.ts` (new) — unit tests for the component.
- `client/src/app/features/conductor/conductor.routes.ts` (modify) — add `printer-setup` route; add `printerSetupGuard` to `ticketing` route's `canActivate`.
- `client/src/app/features/conductor/pages/ticketing/ticketing.ts` (modify) — send real tickets through `PrinterSetupService.sendToPrinter()`.
- `client/src/app/features/conductor/pages/ticketing/ticketing.html` (modify) — no structural change needed; existing `triggerBrowserPrint()` button stays as-is (already present at ticketing.html:346-351).

---

### Task 1: `PrinterSetupService` — state + receipt formatting + RawBT dispatch

**Files:**
- Create: `client/src/app/core/services/printer-setup.service.ts`
- Test: `client/src/app/core/services/printer-setup.service.spec.ts`

**Interfaces:**
- Produces:
  - `PrinterSetupService.isConfigured(): boolean`
  - `PrinterSetupService.markConfigured(): void`
  - `PrinterSetupService.reset(): void`
  - `PrinterSetupService.buildReceiptText(ticket: PrinterReceiptData): string`
  - `PrinterSetupService.sendToPrinter(text: string): void`
  - `interface PrinterReceiptData { ticketNumber: string | number; busNumber: string; plateNumber: string; origin: string; destination: string; category: string; distance: number; fare: number; date: Date; }` (exported from the same file)
- Consumes: nothing from other new files (this is the foundation task).

- [ ] **Step 1: Write the failing tests**

```typescript
// client/src/app/core/services/printer-setup.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { PrinterSetupService } from './printer-setup.service';

describe('PrinterSetupService', () => {
  let service: PrinterSetupService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(PrinterSetupService);
  });

  it('reports not configured by default', () => {
    expect(service.isConfigured()).toBe(false);
  });

  it('reports configured after markConfigured and persists across instances', () => {
    service.markConfigured();
    expect(service.isConfigured()).toBe(true);

    const fresh = TestBed.inject(PrinterSetupService);
    expect(fresh.isConfigured()).toBe(true);
  });

  it('reports not configured after reset', () => {
    service.markConfigured();
    service.reset();
    expect(service.isConfigured()).toBe(false);
  });

  it('builds receipt text containing key ticket fields', () => {
    const text = service.buildReceiptText({
      ticketNumber: 42,
      busNumber: 'BUS-01',
      plateNumber: 'ABC-1234',
      origin: 'Manila',
      destination: 'Baguio',
      category: 'regular',
      distance: 12.5,
      fare: 85.5,
      date: new Date('2026-07-16T08:00:00Z'),
    });

    expect(text).toContain('TICKET NO: #42');
    expect(text).toContain('BUS-01');
    expect(text).toContain('ABC-1234');
    expect(text).toContain('Manila');
    expect(text).toContain('Baguio');
    expect(text).toContain('12.5 km');
    expect(text).toContain('85.50');
  });

  it('sendToPrinter navigates to a rawbt: URL containing the encoded text', () => {
    const originalHref = window.location.href;
    let capturedHref = '';
    Object.defineProperty(window, 'location', {
      value: { ...window.location, set href(v: string) { capturedHref = v; }, get href() { return capturedHref || originalHref; } },
      writable: true,
    });

    service.sendToPrinter('Hello Printer');
    expect(capturedHref).toBe(`rawbt:${encodeURIComponent('Hello Printer')}`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/app/core/services/printer-setup.service.spec.ts`
Expected: FAIL — `Cannot find module './printer-setup.service'`

- [ ] **Step 3: Write the implementation**

```typescript
// client/src/app/core/services/printer-setup.service.ts
import { Injectable, signal } from '@angular/core';

export interface PrinterReceiptData {
  ticketNumber: string | number;
  busNumber: string;
  plateNumber: string;
  origin: string;
  destination: string;
  category: string;
  distance: number;
  fare: number;
  date: Date;
}

const STORAGE_KEY = 'japs.printerSetup.configured';

@Injectable({ providedIn: 'root' })
export class PrinterSetupService {
  private _configured = signal<boolean>(localStorage.getItem(STORAGE_KEY) === 'true');

  isConfigured(): boolean {
    return this._configured();
  }

  markConfigured(): void {
    localStorage.setItem(STORAGE_KEY, 'true');
    this._configured.set(true);
  }

  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._configured.set(false);
  }

  buildReceiptText(ticket: PrinterReceiptData): string {
    const lines = [
      'JAPS TRANSIT',
      'Bus Operations & Ticketing',
      `Date: ${ticket.date.toLocaleString()}`,
      '--------------------------------',
      `TICKET NO: #${ticket.ticketNumber}`,
      `BUS NO: ${ticket.busNumber}`,
      `PLATE NO: ${ticket.plateNumber}`,
      `ROUTE: ${ticket.origin} -> ${ticket.destination}`,
      '--------------------------------',
      `Distance: ${ticket.distance} km`,
      `Category: ${ticket.category}`,
      `TOTAL AMOUNT: PHP ${ticket.fare.toFixed(2)}`,
      '--------------------------------',
      'Thank you for riding JAPS Transit!',
    ];
    return lines.join('\n');
  }

  sendToPrinter(text: string): void {
    window.location.href = `rawbt:${encodeURIComponent(text)}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/app/core/services/printer-setup.service.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/app/core/services/printer-setup.service.ts client/src/app/core/services/printer-setup.service.spec.ts
git commit -m "feat: add PrinterSetupService for RawBT-backed ticket printing"
```

---

### Task 2: `printerSetupGuard`

**Files:**
- Create: `client/src/app/core/guards/printer-setup.guard.ts`
- Test: `client/src/app/core/guards/printer-setup.guard.spec.ts`

**Interfaces:**
- Consumes: `PrinterSetupService.isConfigured(): boolean` (Task 1).
- Produces: `printerSetupGuard: CanActivateFn`, used by Task 4's route config.

- [ ] **Step 1: Write the failing tests**

```typescript
// client/src/app/core/guards/printer-setup.guard.spec.ts
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { printerSetupGuard } from './printer-setup.guard';
import { PrinterSetupService } from '../services/printer-setup.service';

describe('printerSetupGuard', () => {
  it('allows activation when printer is configured', () => {
    const isConfigured = () => true;
    TestBed.configureTestingModule({
      providers: [
        { provide: PrinterSetupService, useValue: { isConfigured } },
        { provide: Router, useValue: { navigate: () => {} } },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      printerSetupGuard({} as any, {} as any),
    );
    expect(result).toBe(true);
  });

  it('redirects to printer-setup and blocks activation when not configured', () => {
    const isConfigured = () => false;
    const navigate = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PrinterSetupService, useValue: { isConfigured } },
        { provide: Router, useValue: { navigate } },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      printerSetupGuard({} as any, {} as any),
    );
    expect(result).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/conductor/printer-setup']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npx vitest run src/app/core/guards/printer-setup.guard.spec.ts`
Expected: FAIL — `Cannot find module './printer-setup.guard'`

- [ ] **Step 3: Write the implementation**

```typescript
// client/src/app/core/guards/printer-setup.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PrinterSetupService } from '../services/printer-setup.service';

export const printerSetupGuard: CanActivateFn = () => {
  const printerSetup = inject(PrinterSetupService);
  const router = inject(Router);

  if (printerSetup.isConfigured()) return true;

  router.navigate(['/conductor/printer-setup']);
  return false;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/app/core/guards/printer-setup.guard.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/app/core/guards/printer-setup.guard.ts client/src/app/core/guards/printer-setup.guard.spec.ts
git commit -m "feat: add printerSetupGuard to gate ticketing behind printer setup"
```

---

### Task 3: `PrinterSetupPage` component

**Files:**
- Create: `client/src/app/features/conductor/pages/printer-setup/printer-setup.ts`
- Create: `client/src/app/features/conductor/pages/printer-setup/printer-setup.html`
- Create: `client/src/app/features/conductor/pages/printer-setup/printer-setup.css`
- Test: `client/src/app/features/conductor/pages/printer-setup/printer-setup.spec.ts`

**Interfaces:**
- Consumes: `PrinterSetupService.buildReceiptText()`, `.sendToPrinter()`, `.markConfigured()`, `.reset()`, `.isConfigured()` (Task 1).
- Produces: `PrinterSetupPage` class, used by Task 4's route config (`loadComponent`).

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/app/features/conductor/pages/printer-setup/printer-setup.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PrinterSetupPage } from './printer-setup';
import { PrinterSetupService } from '../../../../core/services/printer-setup.service';

describe('PrinterSetupPage', () => {
  let component: PrinterSetupPage;
  let fixture: ComponentFixture<PrinterSetupPage>;
  let sendToPrinter: ReturnType<typeof vi.fn>;
  let markConfigured: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    sendToPrinter = vi.fn();
    markConfigured = vi.fn();

    await TestBed.configureTestingModule({
      imports: [PrinterSetupPage],
      providers: [
        provideRouter([]),
        {
          provide: PrinterSetupService,
          useValue: {
            buildReceiptText: () => 'SAMPLE RECEIPT',
            sendToPrinter,
            markConfigured,
            reset: vi.fn(),
            isConfigured: () => false,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PrinterSetupPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sends a sample receipt when sendTestPrint is called', () => {
    component.sendTestPrint();
    expect(sendToPrinter).toHaveBeenCalledWith('SAMPLE RECEIPT');
    expect(component.showConfirmation()).toBe(true);
  });

  it('marks configured and clears confirmation on confirmSuccess', () => {
    component.sendTestPrint();
    component.confirmSuccess();
    expect(markConfigured).toHaveBeenCalled();
    expect(component.showConfirmation()).toBe(false);
  });

  it('shows troubleshooting and clears confirmation on confirmFailure', () => {
    component.sendTestPrint();
    component.confirmFailure();
    expect(markConfigured).not.toHaveBeenCalled();
    expect(component.showConfirmation()).toBe(false);
    expect(component.showTroubleshooting()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/app/features/conductor/pages/printer-setup/printer-setup.spec.ts`
Expected: FAIL — `Cannot find module './printer-setup'`

- [ ] **Step 3: Write the implementation**

```typescript
// client/src/app/features/conductor/pages/printer-setup/printer-setup.ts
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PrinterSetupService } from '../../../../core/services/printer-setup.service';

@Component({
  selector: 'app-printer-setup',
  imports: [],
  templateUrl: './printer-setup.html',
  styleUrl: './printer-setup.css',
})
export class PrinterSetupPage {
  private printerSetup = inject(PrinterSetupService);
  private router = inject(Router);

  showConfirmation = signal(false);
  showTroubleshooting = signal(false);
  showMissingAppHint = signal(false);
  private hintTimer: ReturnType<typeof setTimeout> | undefined;

  sendTestPrint(): void {
    this.showTroubleshooting.set(false);
    this.showMissingAppHint.set(false);

    const sampleText = this.printerSetup.buildReceiptText({
      ticketNumber: 'TEST',
      busNumber: 'SAMPLE-BUS',
      plateNumber: 'SAMPLE-000',
      origin: 'Test Origin',
      destination: 'Test Destination',
      category: 'regular',
      distance: 1,
      fare: 0,
      date: new Date(),
    });

    this.printerSetup.sendToPrinter(sampleText);
    this.showConfirmation.set(true);

    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.showMissingAppHint.set(true), 4000);
  }

  confirmSuccess(): void {
    this.printerSetup.markConfigured();
    this.showConfirmation.set(false);
    this.router.navigate(['/conductor/ticketing']);
  }

  confirmFailure(): void {
    this.showConfirmation.set(false);
    this.showTroubleshooting.set(true);
  }

  isConfigured(): boolean {
    return this.printerSetup.isConfigured();
  }

  reconfigure(): void {
    this.printerSetup.reset();
    this.showConfirmation.set(false);
    this.showTroubleshooting.set(false);
  }
}
```

```html
<!-- client/src/app/features/conductor/pages/printer-setup/printer-setup.html -->
<div class="max-w-xl mx-auto bg-white rounded-2xl p-6 shadow-md border border-gray-100 mt-8">
  <h2 class="text-lg font-bold text-gray-800 mb-2">Printer Setup</h2>
  <p class="text-sm text-gray-500 mb-4">
    Ticketing requires a Bluetooth thermal printer connected through the
    <strong>RawBT</strong> app. Install RawBT and pair your printer inside it first, then
    send a test print below.
  </p>

  <a
    href="https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter"
    target="_blank"
    rel="noopener"
    class="inline-block text-blue-600 text-sm font-semibold underline mb-6"
  >
    Install RawBT from Play Store
  </a>

  @if (isConfigured()) {
    <div class="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-sm text-green-800">
      Printer setup is complete on this device.
    </div>
    <button
      (click)="reconfigure()"
      class="text-xs font-bold text-gray-500 hover:text-gray-700 underline cursor-pointer"
    >
      Reconfigure printer
    </button>
  } @else {
    <button
      (click)="sendTestPrint()"
      class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all cursor-pointer"
    >
      Send Test Print
    </button>

    @if (showMissingAppHint()) {
      <p class="text-xs text-amber-600 mt-3">
        Nothing happened? Make sure RawBT is installed using the link above.
      </p>
    }

    @if (showConfirmation()) {
      <div class="mt-5 border-t border-gray-100 pt-4">
        <p class="text-sm font-semibold text-gray-700 mb-3">Did the test receipt print?</p>
        <div class="flex gap-3">
          <button
            (click)="confirmSuccess()"
            class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-xl cursor-pointer"
          >
            Yes
          </button>
          <button
            (click)="confirmFailure()"
            class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-xl cursor-pointer"
          >
            No
          </button>
        </div>
      </div>
    }

    @if (showTroubleshooting()) {
      <div class="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        Make sure the printer is powered on and paired inside RawBT, then try the test print
        again.
      </div>
    }
  }
</div>
```

```css
/* client/src/app/features/conductor/pages/printer-setup/printer-setup.css */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/app/features/conductor/pages/printer-setup/printer-setup.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/app/features/conductor/pages/printer-setup/
git commit -m "feat: add PrinterSetupPage for conductor Bluetooth printer confirmation"
```

---

### Task 4: Wire up routes

**Files:**
- Modify: `client/src/app/features/conductor/conductor.routes.ts`

**Interfaces:**
- Consumes: `printerSetupGuard` (Task 2), `PrinterSetupPage` (Task 3).
- Produces: `conductor/printer-setup` route; `conductor/ticketing` gated by `printerSetupGuard`.

- [ ] **Step 1: Modify the route config**

```typescript
// client/src/app/features/conductor/conductor.routes.ts
import { Routes } from '@angular/router';
import { ConductorLayout } from './layout/conductor-layout/conductor-layout';
import { authGuard } from '../../core/guards/auth.guard';
import { roleGuard } from '../../core/guards/role.guard';
import { printerSetupGuard } from '../../core/guards/printer-setup.guard';

export const CONDUCTOR_ROUTES: Routes = [
  {
    path: '',
    component: ConductorLayout,
    canActivate: [authGuard, roleGuard('conductor')],
    children: [
      { path: '', redirectTo: 'trips', pathMatch: 'full' },
      {
        path: 'trips',
        loadComponent: () =>
          import('./pages/dashboard/dashboard').then((m) => m.ConductorDashboard),
      },
      {
        path: 'ticketing',
        canActivate: [printerSetupGuard],
        loadComponent: () => import('./pages/ticketing/ticketing').then((m) => m.TicketingPage),
      },
      {
        path: 'printer-setup',
        loadComponent: () =>
          import('./pages/printer-setup/printer-setup').then((m) => m.PrinterSetupPage),
      },
      {
        path: 'tickets',
        loadComponent: () => import('./pages/tickets').then((m) => m.TicketsPage),
      },
      {
        path: 'remittances',
        loadComponent: () =>
          import('./pages/remittances/remittances').then((m) => m.ConductorRemittancesPage),
      },
    ],
  },
];
```

- [ ] **Step 2: Manually verify route wiring**

Run: `cd client && npm start`
Then in a browser: navigate to `http://localhost:2736/conductor/ticketing` while logged in as a conductor whose device has never had `japs.printerSetup.configured` set.
Expected: redirected to `/conductor/printer-setup`.
Then run `localStorage.setItem('japs.printerSetup.configured', 'true')` in the browser console and reload `/conductor/ticketing`.
Expected: Ticketing page loads normally.

- [ ] **Step 3: Commit**

```bash
git add client/src/app/features/conductor/conductor.routes.ts
git commit -m "feat: gate conductor ticketing route behind printer setup guard"
```

---

### Task 5: Route real ticket prints through `PrinterSetupService`

**Files:**
- Modify: `client/src/app/features/conductor/pages/ticketing/ticketing.ts`
- Test: `client/src/app/features/conductor/pages/ticketing/ticketing.spec.ts` (new)

**Interfaces:**
- Consumes: `PrinterSetupService.sendToPrinter()`, `.buildReceiptText()` (Task 1).
- Produces: no new public API — modifies `printTicketSubmit()`'s success handler only. `triggerBrowserPrint()` (existing, ticketing.ts:269-271) is unchanged and remains wired to the existing template button (ticketing.html:346-351).

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/app/features/conductor/pages/ticketing/ticketing.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TicketingPage } from './ticketing';
import { PrinterSetupService } from '../../../../core/services/printer-setup.service';
import { environment } from '../../../../../environments/environment';

describe('TicketingPage', () => {
  let component: TicketingPage;
  let fixture: ComponentFixture<TicketingPage>;
  let httpMock: HttpTestingController;
  let sendToPrinter: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    sendToPrinter = vi.fn();

    await TestBed.configureTestingModule({
      imports: [TicketingPage, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        {
          provide: PrinterSetupService,
          useValue: {
            sendToPrinter,
            buildReceiptText: () => 'RECEIPT TEXT',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketingPage);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    // Satisfy ngOnInit's fare-settings + trips requests.
    httpMock.expectOne(`${environment.apiUrl}/api/fare-settings`).flush({
      minimum_fare: 10,
      base_distance_km: 4,
      rate_per_km: 2,
      regular_multiplier: 100,
      student_multiplier: 80,
      senior_citizen_multiplier: 80,
      pwd_multiplier: 80,
      discounted_multiplier: 80,
    });
    httpMock.expectOne(`${environment.apiUrl}/api/conductor/trips`).flush([]);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('sends the receipt to the printer after a successful ticket submission', () => {
    component.selectedTripId.set(1);
    component.trips.set([
      {
        id: 1,
        trip_number: 1,
        status: 'ongoing',
        departure_time: new Date().toISOString(),
        grand_total: 0,
        ticket_number_start: null,
        ticket_number_end: null,
        BusModel: { id: 1, bus_number: 'BUS-01', plate_number: 'ABC-123', capacity: 40 },
        Route: { id: 1, origin: 'Manila', destination: 'Baguio', distance_km: 250 },
      },
    ]);
    component.ticketForm.setValue({ category: 'regular', distance: 5, fare: 20 });

    component.printTicketSubmit();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/conductor/trips/1/tickets`);
    req.flush({ ticket: { ticket_number: 7 } });

    expect(sendToPrinter).toHaveBeenCalledWith('RECEIPT TEXT');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/app/features/conductor/pages/ticketing/ticketing.spec.ts`
Expected: FAIL — `sendToPrinter` not called (0 calls), since `printTicketSubmit()` doesn't yet invoke `PrinterSetupService`.

- [ ] **Step 3: Modify `printTicketSubmit()`**

In `client/src/app/features/conductor/pages/ticketing/ticketing.ts`, add the import and inject the service, then call it from the success branch:

```typescript
// Add to imports at the top of the file
import { PrinterSetupService } from '../../../../core/services/printer-setup.service';
```

```typescript
// Add alongside the other injected services
private printerSetup = inject(PrinterSetupService);
```

Replace the `next` handler inside `printTicketSubmit()` (ticketing.ts:240-257):

```typescript
        next: (res) => {
          this.isPrinting.set(false);
          const printed = {
            ticketNumber: res.ticket?.ticket_number,
            category: payload.category,
            distance: payload.distance,
            fare: payload.fare,
            date: new Date(),
            route: this.selectedTrip()?.Route,
            bus: this.selectedTrip()?.BusModel,
          };
          this.lastPrintedTicket.set(printed);
          this.showPrintModal.set(true);

          this.printerSetup.sendToPrinter(
            this.printerSetup.buildReceiptText({
              ticketNumber: printed.ticketNumber,
              busNumber: printed.bus?.bus_number ?? '',
              plateNumber: printed.bus?.plate_number ?? '',
              origin: printed.route?.origin ?? '',
              destination: printed.route?.destination ?? '',
              category: printed.category,
              distance: printed.distance,
              fare: printed.fare,
              date: printed.date,
            }),
          );

          this.alertService.success('Success', 'Ticket generated and sent to printing terminal.');

          // Refresh local trip info & counts
          this.loadTrips();
          this.loadPassengerCounts(tripId);
        },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/app/features/conductor/pages/ticketing/ticketing.spec.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Run the full client test suite to check for regressions**

Run: `cd client && npm test`
Expected: all existing and new tests pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/app/features/conductor/pages/ticketing/ticketing.ts client/src/app/features/conductor/pages/ticketing/ticketing.spec.ts
git commit -m "feat: send printed tickets to Bluetooth printer via RawBT"
```

---

## Manual End-to-End Verification (not automated)

Per the spec, the RawBT hand-off and physical print output cannot be exercised in an automated test. After Task 5 is complete, verify on a real Android device:

1. Install RawBT and pair a Bluetooth thermal printer inside it.
2. Log in as a conductor on that device, navigate to `conductor/ticketing` — confirm redirect to `conductor/printer-setup`.
3. Tap "Send Test Print" — confirm RawBT opens and the printer outputs a test receipt.
4. Tap "Yes" — confirm redirect to `conductor/ticketing` and that the page now loads directly on subsequent visits.
5. Issue a real ticket — confirm the printer outputs the ticket receipt in addition to the on-screen modal.
6. Tap "Print Receipt" in the modal — confirm the browser print dialog still opens (fallback path untouched).

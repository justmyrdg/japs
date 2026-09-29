import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AlertService } from '../../../../core/services/alert.service';
import { environment } from '../../../../../environments/environment';
import { TablePagination } from '../../../../shared/components/table-pagination/table-pagination';
import { expenseTypeLabel } from '../../../../shared/constants/expense-types';
import { passengerCategoryLabel } from '../../../../shared/models/ticket.models';

interface Remittance {
  id: number;
  date: string;
  no_of_trips: number;
  gross_income: number;
  total_expenses: number;
  net_gross: number;
  driver_commission: number;
  conductor_commission: number;
  bonus_allowance: number;
  other_deductions: number;
  cash_deposit: number;
  total_less: number;
  net_collection: number;
  driver_officer_share: number;
  conductor_officer_share: number;
  teller_remarks: string | null;
  status: 'submitted' | 'approved' | 'rejected' | 'finalized';
  submitted_at: string;
  approved_at: string | null;
  conductor: { id: number; first_name: string; last_name: string; employee_id: string };
  driver: { id: number; first_name: string; last_name: string; employee_id: string };
  BusModel: { id: number; bus_number: string; plate_number: string };
  approver: { id: number; first_name: string; last_name: string } | null;
  RemittanceExpenses: { id: number; expense_type: string; amount: number }[];
  Trips: {
    id: number;
    trip_number: number;
    departure_time: string;
    grand_total: number;
    ticket_number_start: string | null;
    ticket_number_end: string | null;
    Route: { origin: string; destination: string } | null;
  }[];
}

interface Trip {
  id: number;
  trip_number: number;
  status: string;
  departure_time: string;
  grand_total: number;
  ticket_number_start: string | null;
  ticket_number_end: string | null;
  remittance_id: number | null;
  bus_id: number;
  driver_id: number;
  conductor_id: number;
  BusModel?: { id: number; bus_number: string; plate_number: string };
  Route?: { origin: string; destination: string };
  driver?: { id: number; first_name: string; last_name: string };
  conductor?: { id: number; first_name: string; last_name: string };
  // Number of tickets issued on the trip (0 = ran without the ticketing terminal).
  ticket_count?: number | string;
}

/** Results typed in by hand for a trip that ran without the ticketing terminal. */
interface ManualTripEntry {
  counts: Record<string, number>;
  collection: number;
  departure: string; // datetime-local, optional
  arrival: string; // datetime-local, optional
}

/** An unremitted entry from the conductor's expense log. */
interface LoggedExpense {
  id: number;
  trip_id: number | null;
  expense_type: string;
  amount: string | number;
}

const MANUAL_CATEGORIES = ['regular', 'student', 'senior_citizen', 'pwd', 'discounted'];

// Remittance form control for each expense type.
const EXPENSE_CONTROLS: Record<string, string> = {
  officer: 'exp_officer',
  toll_fees: 'exp_toll_fees',
  parking: 'exp_parking',
  ppa: 'exp_ppa',
  washing: 'exp_washing',
  diesel: 'exp_diesel',
  caller_grand_terminal: 'exp_caller_grand_terminal',
  caller_calamba_terminal: 'exp_caller_calamba_terminal',
  pwd: 'exp_pwd',
  miscellaneous: 'exp_miscellaneous',
};

/** datetime-local value (YYYY-MM-DDTHH:mm) in the browser's local time. */
const toDateTimeLocal = (d: string | Date): string => {
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

type SortField = 'date' | 'submitted_at' | 'net_collection' | 'status';
type Tab = 'list' | 'submit';

@Component({
  selector: 'app-conductor-remittances',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, TablePagination],
  templateUrl: './remittances.html',
})
export class ConductorRemittancesPage implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private alertService = inject(AlertService);

  private readonly API = `${environment.apiUrl}/api/conductor`;

  // ── Tab state ──
  activeTab = signal<Tab>('list');

  // ── List state ──
  private allRemittances = signal<Remittance[]>([]);
  loadingList = signal(false);
  selected = signal<Remittance | null>(null);

  search = signal('');
  statusFilter = signal('all');
  dateFrom = signal('');
  dateTo = signal('');
  sortField = signal<SortField>('submitted_at');
  sortDir = signal<'asc' | 'desc'>('desc');
  pageSize = signal(10);
  currentPage = signal(1);
  readonly PAGE_SIZES = [10, 25, 50];

  // ── Submit state ──
  selectedDate = signal<string>(new Date().toISOString().split('T')[0]);
  selectedBus = signal<any | null>(null);
  allTrips = signal<Trip[]>([]);
  selectedTripIds = signal<Set<number>>(new Set());
  buses = signal<any[]>([]);
  loadingTrips = signal(false);
  isSubmitting = signal(false);
  formValues = signal<any>({});
  remittanceForm: FormGroup;

  readonly MANUAL_CATEGORIES = MANUAL_CATEGORIES;
  // Manually encoded results, keyed by trip id (only for trips without tickets).
  manualEntries = signal<Record<number, ManualTripEntry>>({});
  // Unremitted expense-log entries for the selected bus/date.
  loggedExpenses = signal<LoggedExpense[]>([]);
  /** Logged expenses that belong to the currently selected trips. */
  includedLoggedExpenses = computed(() => {
    const ids = this.selectedTripIds();
    return this.loggedExpenses().filter((e) => e.trip_id != null && ids.has(e.trip_id));
  });
  includedLoggedTotal = computed(() =>
    this.includedLoggedExpenses().reduce((sum, e) => sum + Number(e.amount), 0),
  );

  constructor() {
    this.remittanceForm = this.fb.group({
      exp_officer: [0, [Validators.min(0)]],
      exp_toll_fees: [0, [Validators.min(0)]],
      exp_parking: [0, [Validators.min(0)]],
      exp_ppa: [0, [Validators.min(0)]],
      exp_washing: [0, [Validators.min(0)]],
      exp_diesel: [0, [Validators.min(0)]],
      exp_caller_grand_terminal: [0, [Validators.min(0)]],
      exp_caller_calamba_terminal: [0, [Validators.min(0)]],
      exp_pwd: [0, [Validators.min(0)]],
      exp_miscellaneous: [0, [Validators.min(0)]],
      driver_commission: [0, [Validators.required, Validators.min(0)]],
      conductor_commission: [0, [Validators.required, Validators.min(0)]],
      bonus_allowance: [0, [Validators.min(0)]],
      other_deductions: [0, [Validators.min(0)]],
      cash_deposit: [0, [Validators.required, Validators.min(0)]],
      driver_officer_share: [0, [Validators.min(0)]],
      conductor_officer_share: [0, [Validators.min(0)]],
    });
  }

  ngOnInit(): void {
    this.loadRemittances();
    this.loadBuses();
    this.remittanceForm.valueChanges.subscribe((v) => this.formValues.set(v));
    this.formValues.set(this.remittanceForm.value);
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  // ── List methods ──
  loadRemittances(): void {
    this.loadingList.set(true);
    this.http.get<Remittance[]>(`${this.API}/remittances`, { withCredentials: true }).subscribe({
      next: (data) => {
        this.allRemittances.set(data);
        this.loadingList.set(false);
      },
      error: () => this.loadingList.set(false),
    });
  }

  filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    const status = this.statusFilter();
    const from = this.dateFrom();
    const to = this.dateTo();
    return this.allRemittances().filter((r) => {
      const matchSearch =
        !q ||
        r.BusModel.bus_number.toLowerCase().includes(q) ||
        r.BusModel.plate_number.toLowerCase().includes(q) ||
        r.driver.first_name.toLowerCase().includes(q) ||
        r.driver.last_name.toLowerCase().includes(q);
      const matchStatus = status === 'all' || r.status === status;
      const d = new Date(r.date);
      const matchFrom = !from || d >= new Date(from);
      const matchTo = !to || d <= new Date(to + 'T23:59:59');
      return matchSearch && matchStatus && matchFrom && matchTo;
    });
  });

  sorted = computed(() => {
    const field = this.sortField();
    const dir = this.sortDir();
    return [...this.filtered()].sort((a, b) => {
      let av: any = a[field];
      let bv: any = b[field];
      if (field === 'net_collection') {
        av = Number(av);
        bv = Number(bv);
      }
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  totalItems = computed(() => this.sorted().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));
  pageStart = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  pageEnd = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalItems()));
  paged = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.sorted().slice(start, start + this.pageSize());
  });
  pageNumbers = computed(() => {
    const total = this.totalPages(),
      cur = this.currentPage();
    const pages: (number | '...')[] = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || Math.abs(i - cur) <= 1) pages.push(i);
      else if (pages[pages.length - 1] !== '...') pages.push('...');
    }
    return pages;
  });

  onSearch(e: Event): void {
    this.search.set((e.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }
  onStatusFilter(e: Event): void {
    this.statusFilter.set((e.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }
  onDateFromChange(e: Event): void {
    this.dateFrom.set((e.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }
  onDateToChange(e: Event): void {
    this.dateTo.set((e.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }
  clearDateFilters(): void {
    this.dateFrom.set('');
    this.dateTo.set('');
    this.currentPage.set(1);
  }
  setSort(field: SortField): void {
    if (this.sortField() === field) this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      this.sortField.set(field);
      this.sortDir.set('asc');
    }
    this.currentPage.set(1);
  }
  sortIcon(field: SortField): string {
    if (this.sortField() !== field) return 'pi-sort';
    return this.sortDir() === 'asc' ? 'pi-sort-up' : 'pi-sort-down';
  }
  setPage(page: number): void {
    this.currentPage.set(page);
  }
  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }
  getStatusBadge(status: string): string {
    return (
      (
        {
          submitted: 'bg-amber-100 text-amber-800',
          approved: 'bg-green-100 text-green-800',
          rejected: 'bg-red-100 text-red-800',
          finalized: 'bg-blue-100 text-blue-800',
        } as any
      )[status] ?? 'bg-gray-100 text-gray-800'
    );
  }

  formatExpenseType(type: string): string {
    return expenseTypeLabel(type);
  }

  categoryLabel(category: string): string {
    return passengerCategoryLabel(category);
  }

  // ── Submit methods ──
  loadBuses(): void {
    // Derive unique buses from the conductor's own trips (no owner-only /api/buses needed)
    this.http.get<any[]>(`${this.API}/trips`, { withCredentials: true }).subscribe({
      next: (trips) => {
        const seen = new Set<number>();
        const buses: any[] = [];
        for (const t of trips) {
          if (t.BusModel && !seen.has(t.BusModel.id)) {
            seen.add(t.BusModel.id);
            buses.push(t.BusModel);
          }
        }
        this.buses.set(buses);
      },
      error: () => this.alertService.error('Error', 'Failed to load buses.'),
    });
  }

  loadTrips(): void {
    const bus = this.selectedBus();
    if (!bus) {
      this.allTrips.set([]);
      return;
    }
    this.loadingTrips.set(true);
    this.selectedTripIds.set(new Set());
    this.manualEntries.set({});
    this.loadLoggedExpenses();
    this.http
      .get<Trip[]>(`${this.API}/trips`, {
        params: { date: this.selectedDate(), busId: bus.id.toString(), includeOpen: '1' },
        withCredentials: true,
      })
      .subscribe({
        next: (data) => {
          // Ticketed trips can only be remitted once completed; trips without tickets can
          // be remitted from any state by encoding their results manually.
          this.allTrips.set(
            data.filter(
              (t) => !t.remittance_id && (t.status === 'completed' || this.isManual(t)),
            ),
          );
          this.loadingTrips.set(false);
        },
        error: () => {
          this.loadingTrips.set(false);
          this.alertService.error('Error', 'Failed to load trips.');
        },
      });
  }

  onBusChange(e: Event): void {
    const id = (e.target as HTMLSelectElement).value;
    this.selectedBus.set(id ? (this.buses().find((b) => b.id === parseInt(id)) ?? null) : null);
    this.loadTrips();
  }

  onSubmitDateChange(e: Event): void {
    this.selectedDate.set((e.target as HTMLInputElement).value);
    this.loadTrips();
  }

  toggleTrip(id: number): void {
    const set = new Set(this.selectedTripIds());
    set.has(id) ? set.delete(id) : set.add(id);
    this.selectedTripIds.set(set);
    this.onTripSelectionChanged();
  }

  toggleAll(): void {
    this.selectedTripIds.set(
      this.selectedTripIds().size === this.allTrips().length
        ? new Set()
        : new Set(this.allTrips().map((t) => t.id)),
    );
    this.onTripSelectionChanged();
  }

  private onTripSelectionChanged(): void {
    this.ensureManualEntries();
    this.prefillLoggedExpenses();
    this.autoCalculateCommissions();
  }

  // ── Trips without tickets (manual encoding) ──
  isManual(t: Trip): boolean {
    return Number(t.ticket_count ?? 0) === 0;
  }

  /** Amount a trip contributes to gross income: ticket total, or the encoded collection. */
  tripAmount(t: Trip): number {
    return this.isManual(t)
      ? Number(this.manualEntries()[t.id]?.collection ?? 0)
      : Number(t.grand_total);
  }

  manualPassengerTotal(tripId: number): number {
    const entry = this.manualEntries()[tripId];
    return entry ? Object.values(entry.counts).reduce((sum, n) => sum + Number(n || 0), 0) : 0;
  }

  /** Every selected manual trip gets an entry, starting at zero. */
  private ensureManualEntries(): void {
    const entries = { ...this.manualEntries() };
    for (const t of this.selectedTrips()) {
      if (this.isManual(t) && !entries[t.id]) {
        entries[t.id] = {
          counts: Object.fromEntries(MANUAL_CATEGORIES.map((c) => [c, 0])),
          collection: 0,
          departure: '',
          arrival: '',
        };
      }
    }
    this.manualEntries.set(entries);
  }

  updateManualCount(tripId: number, category: string, e: Event): void {
    const value = Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0));
    this.patchManual(tripId, (m) => ({ ...m, counts: { ...m.counts, [category]: value } }));
  }

  updateManualCollection(tripId: number, e: Event): void {
    const value = Math.max(0, Number((e.target as HTMLInputElement).value) || 0);
    this.patchManual(tripId, (m) => ({ ...m, collection: value }));
    this.autoCalculateCommissions();
  }

  updateManualTime(tripId: number, field: 'departure' | 'arrival', e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    this.patchManual(tripId, (m) => ({ ...m, [field]: value }));
  }

  private patchManual(tripId: number, fn: (m: ManualTripEntry) => ManualTripEntry): void {
    const current = this.manualEntries()[tripId];
    if (!current) return;
    this.manualEntries.set({ ...this.manualEntries(), [tripId]: fn(current) });
  }

  scheduledTimeLocal(t: Trip): string {
    return toDateTimeLocal(t.departure_time);
  }

  // ── Expense log pre-fill ──
  private loadLoggedExpenses(): void {
    const bus = this.selectedBus();
    this.loggedExpenses.set([]);
    if (!bus) return;
    this.http
      .get<LoggedExpense[]>(`${this.API}/expenses`, {
        params: { date: this.selectedDate(), busId: bus.id.toString(), unremitted: '1' },
        withCredentials: true,
      })
      .subscribe({
        next: (data) => {
          this.loggedExpenses.set(data);
          this.prefillLoggedExpenses();
        },
      });
  }

  /** Fills each expense field with the logged total for the selected trips, unless the
   *  conductor has already typed their own figure into that field. */
  private prefillLoggedExpenses(): void {
    const totals: Record<string, number> = {};
    for (const e of this.includedLoggedExpenses()) {
      totals[e.expense_type] = (totals[e.expense_type] ?? 0) + Number(e.amount);
    }
    for (const [type, ctrlName] of Object.entries(EXPENSE_CONTROLS)) {
      const ctrl = this.remittanceForm.get(ctrlName);
      if (ctrl && !ctrl.dirty) ctrl.setValue(+(totals[type] ?? 0).toFixed(2));
    }
  }

  isSelected(id: number): boolean {
    return this.selectedTripIds().has(id);
  }

  selectedTrips = computed(() => this.allTrips().filter((t) => this.selectedTripIds().has(t.id)));

  autoCalculateCommissions(): void {
    const gross = this.grossIncome();
    this.remittanceForm.patchValue({
      driver_commission: parseFloat((gross * 0.1).toFixed(2)),
      conductor_commission: parseFloat((gross * 0.08).toFixed(2)),
    });
  }

  grossIncome = computed(() => this.selectedTrips().reduce((sum, t) => sum + this.tripAmount(t), 0));

  totalExpenses = computed(() => {
    const f = this.formValues();
    return [
      f.exp_officer,
      f.exp_toll_fees,
      f.exp_parking,
      f.exp_ppa,
      f.exp_washing,
      f.exp_diesel,
      f.exp_caller_grand_terminal,
      f.exp_caller_calamba_terminal,
      f.exp_pwd,
      f.exp_miscellaneous,
    ].reduce((sum, v) => sum + Number(v || 0), 0);
  });

  netGross = computed(() => this.grossIncome() - this.totalExpenses());

  totalLess = computed(() => {
    const f = this.formValues();
    return (
      Number(f.driver_commission || 0) +
      Number(f.conductor_commission || 0) +
      Number(f.bonus_allowance || 0) +
      Number(f.other_deductions || 0) +
      Number(f.cash_deposit || 0)
    );
  });

  netCollection = computed(() => this.netGross() - this.totalLess());

  private buildExpensesPayload() {
    const f = this.remittanceForm.value;
    const map: Record<string, number> = {
      officer: f.exp_officer,
      toll_fees: f.exp_toll_fees,
      parking: f.exp_parking,
      ppa: f.exp_ppa,
      washing: f.exp_washing,
      diesel: f.exp_diesel,
      caller_grand_terminal: f.exp_caller_grand_terminal,
      caller_calamba_terminal: f.exp_caller_calamba_terminal,
      pwd: f.exp_pwd,
      miscellaneous: f.exp_miscellaneous,
    };
    return Object.entries(map)
      .filter(([, v]) => Number(v) > 0)
      .map(([expense_type, amount]) => ({ expense_type, amount: Number(amount) }));
  }

  submitRemittance(): void {
    if (this.remittanceForm.invalid) {
      this.remittanceForm.markAllAsTouched();
      return;
    }
    const trips = this.selectedTrips();
    if (trips.length === 0) {
      this.alertService.error('Submit Failed', 'Select at least one trip to remit.');
      return;
    }
    const bus = this.selectedBus()!;
    const firstTrip = trips[0];
    const manual_trips = trips
      .filter((t) => this.isManual(t))
      .map((t) => {
        const m = this.manualEntries()[t.id];
        return {
          trip_id: t.id,
          collection: Number(m?.collection ?? 0),
          passenger_counts: MANUAL_CATEGORIES.map((category) => ({
            category,
            count: Number(m?.counts[category] ?? 0),
          })),
          actual_departure_time: m?.departure ? new Date(m.departure).toISOString() : null,
          arrival_time: m?.arrival ? new Date(m.arrival).toISOString() : null,
        };
      });
    this.isSubmitting.set(true);
    const {
      exp_officer,
      exp_toll_fees,
      exp_parking,
      exp_ppa,
      exp_washing,
      exp_diesel,
      exp_caller_grand_terminal,
      exp_caller_calamba_terminal,
      exp_pwd,
      exp_miscellaneous,
      ...rest
    } = this.remittanceForm.value;

    this.http
      .post<any>(
        `${this.API}/remittances`,
        {
          ...rest,
          bus_id: bus.id,
          driver_id: firstTrip.driver_id,
          date: this.selectedDate(),
          trip_ids: trips.map((t) => t.id),
          expenses: this.buildExpensesPayload(),
          manual_trips,
          expense_ids: this.includedLoggedExpenses().map((e) => e.id),
        },
        { withCredentials: true },
      )
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.alertService.success('Success', 'Remittance submitted to audit teller.');
          // Reset form and switch to list tab
          this.remittanceForm.reset({
            exp_officer: 0,
            exp_toll_fees: 0,
            exp_parking: 0,
            exp_ppa: 0,
            exp_washing: 0,
            exp_diesel: 0,
            exp_caller_grand_terminal: 0,
            exp_caller_calamba_terminal: 0,
            exp_pwd: 0,
            exp_miscellaneous: 0,
            driver_commission: 0,
            conductor_commission: 0,
            bonus_allowance: 0,
            other_deductions: 0,
            cash_deposit: 0,
            driver_officer_share: 0,
            conductor_officer_share: 0,
          });
          this.selectedBus.set(null);
          this.allTrips.set([]);
          this.selectedTripIds.set(new Set());
          this.manualEntries.set({});
          this.loggedExpenses.set([]);
          this.loadRemittances();
          this.activeTab.set('list');
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.alertService.error('Error', err.error?.message ?? 'Failed to submit remittance.');
        },
      });
  }
}

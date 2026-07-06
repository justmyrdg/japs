import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AlertService } from '../../../../core/services/alert.service';
import { environment } from '../../../../../environments/environment';
import { TablePagination } from '../../../../shared/components/table-pagination/table-pagination';

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
  status: 'submitted' | 'approved' | 'rejected' | 'finalized';
  submitted_at: string;
  driver: { id: number; first_name: string; last_name: string };
  BusModel: { id: number; bus_number: string; plate_number: string };
  RemittanceExpenses?: { id: number; expense_type: string; amount: number }[];
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
}

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
    this.http
      .get<Trip[]>(`${this.API}/trips`, {
        params: { date: this.selectedDate(), busId: bus.id.toString() },
        withCredentials: true,
      })
      .subscribe({
        next: (data) => {
          this.allTrips.set(data.filter((t) => t.status === 'completed' && !t.remittance_id));
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
    this.autoCalculateCommissions();
  }

  toggleAll(): void {
    this.selectedTripIds.set(
      this.selectedTripIds().size === this.allTrips().length
        ? new Set()
        : new Set(this.allTrips().map((t) => t.id)),
    );
    this.autoCalculateCommissions();
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

  grossIncome = computed(() =>
    this.selectedTrips().reduce((sum, t) => sum + Number(t.grand_total), 0),
  );

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

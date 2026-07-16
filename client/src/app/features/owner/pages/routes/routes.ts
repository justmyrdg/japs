import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertService } from '../../../../core/services/alert.service';
import { environment } from '../../../../../environments/environment';
import { TablePagination } from '../../../../shared/components/table-pagination/table-pagination';

export interface AppRoute {
  id: number;
  origin: string;
  destination: string;
  distance_km: number | null;
}

export interface FareRate {
  id: number;
  route_id: number;
  category: string;
  rate: number;
  effective_date: string;
}

@Component({
  selector: 'app-routes',
  imports: [ReactiveFormsModule, TablePagination],
  templateUrl: './routes.html',
  styleUrl: './routes.css',
})


export class Routes implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private alertService = inject(AlertService);

  private readonly API = `${environment.apiUrl}/api/routes`;

  readonly CATEGORIES = [
    { key: 'regular', label: 'Regular' },
    { key: 'student', label: 'Student' },
    { key: 'senior_citizen', label: 'Senior Citizen' },
    { key: 'pwd', label: 'PWD' },
    { key: 'discounted', label: 'Discounted' },
  ];

  // ── Tabs ──────────────────────────────────────────────────────────────
  activeTab = signal<'routes' | 'fare-matrix'>('routes');

  // ── Routes ────────────────────────────────────────────────────────────
  private allRoutes = signal<AppRoute[]>([]);
  routes = computed(() => this.allRoutes());
  loading = signal(false);

  // ── Table state ───────────────────────────────────────────────────────
  search = signal('');
  pageSize = signal(10);
  currentPage = signal(1);
  readonly PAGE_SIZES = [10, 25, 50];

  // ── Derived ───────────────────────────────────────────────────────────
  filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    return this.allRoutes().filter(
      (r) => !q || r.origin.toLowerCase().includes(q) || r.destination.toLowerCase().includes(q),
    );
  });

  totalItems = computed(() => this.filtered().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));
  pageStart = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  pageEnd = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalItems()));
  paged = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });
  pageNumbers = computed(() => {
    const total = this.totalPages();
    const cur = this.currentPage();
    const pages: (number | '...')[] = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || Math.abs(i - cur) <= 1) pages.push(i);
      else if (pages[pages.length - 1] !== '...') pages.push('...');
    }
    return pages;
  });

  showModal = signal(false);
  showDeleteModal = signal(false);
  editingRoute = signal<AppRoute | null>(null);
  deletingRoute = signal<AppRoute | null>(null);

  form: FormGroup = this.fb.group({
    origin: ['', Validators.required],
    destination: ['', Validators.required],
    distance_km: [null],
  });

  // ── Fare settings ─────────────────────────────────────────────────────
  fareLoading = signal(false);
  fareSaving = signal(false);

  fareForm: FormGroup = this.fb.group({
    minimum_fare: [null, [Validators.required, Validators.min(0)]],
    rate_per_km: [null, [Validators.required, Validators.min(0)]],
    regular_multiplier: [1.0, [Validators.required, Validators.min(0)]],
    student_multiplier: [0.8, [Validators.required, Validators.min(0)]],
    senior_citizen_multiplier: [0.8, [Validators.required, Validators.min(0)]],
    pwd_multiplier: [0.8, [Validators.required, Validators.min(0)]],
    discounted_multiplier: [0.8, [Validators.required, Validators.min(0)]],
    effective_date: ['', Validators.required],
  });

  ngOnInit(): void {
    this.loadRoutes();
  }

  loadRoutes(): void {
    this.loading.set(true);
    this.http.get<AppRoute[]>(this.API, { withCredentials: true }).subscribe({
      next: (data) => {
        this.allRoutes.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSearch(e: Event): void {
    this.search.set((e.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  setPage(page: number): void {
    this.currentPage.set(page);
  }
  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  openAdd(): void {
    this.editingRoute.set(null);
    this.form.reset();
    this.showModal.set(true);
  }

  openEdit(route: AppRoute): void {
    this.editingRoute.set(route);
    this.form.patchValue(route);
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const editing = this.editingRoute();
    const req = editing
      ? this.http.put<AppRoute>(`${this.API}/${editing.id}`, this.form.value, {
          withCredentials: true,
        })
      : this.http.post<AppRoute>(this.API, this.form.value, { withCredentials: true });
    req.subscribe({
      next: () => {
        this.alertService.success('Saved', editing ? 'Route updated.' : 'Route created.');
        this.closeModal();
        this.loadRoutes();
      },
      error: (err) =>
        this.alertService.error('Error', err.error?.message ?? 'Something went wrong.'),
    });
  }

  confirmDelete(route: AppRoute): void {
    this.deletingRoute.set(route);
    this.showDeleteModal.set(true);
  }
  cancelDelete(): void {
    this.showDeleteModal.set(false);
  }

  deleteRoute(): void {
    const route = this.deletingRoute();
    if (!route) return;
    this.http.delete(`${this.API}/${route.id}`, { withCredentials: true }).subscribe({
      next: () => {
        this.alertService.success('Deleted', 'Route removed.');
        this.showDeleteModal.set(false);
        this.loadRoutes();
      },
      error: (err) =>
        this.alertService.error('Error', err.error?.message ?? 'Could not delete route.'),
    });
  }

  // ── Fare settings ─────────────────────────────────────────────────────
  switchTab(tab: 'routes' | 'fare-matrix'): void {
    this.activeTab.set(tab);
    if (tab === 'fare-matrix') {
      this.loadFareSettings();
    }
  }

  loadFareSettings(): void {
    this.fareLoading.set(true);
    this.fareForm.reset();
    this.http
      .get<any>(`${environment.apiUrl}/api/fare-settings`, { withCredentials: true })
      .subscribe({
        next: (settings) => {
          this.fareForm.patchValue(settings);
          this.fareLoading.set(false);
        },
        error: () => this.fareLoading.set(false),
      });
  }

  saveFareSettings(): void {
    if (this.fareForm.invalid) {
      this.fareForm.markAllAsTouched();
      return;
    }
    this.fareSaving.set(true);
    this.http
      .put(`${environment.apiUrl}/api/fare-settings`, this.fareForm.value, {
        withCredentials: true,
      })
      .subscribe({
        next: () => {
          this.alertService.success('Saved', 'Global Fare Matrix settings updated.');
          this.fareSaving.set(false);
        },
        error: (err) => {
          this.alertService.error('Error', err.error?.message ?? 'Could not save fare settings.');
          this.fareSaving.set(false);
        },
      });
  }

  fieldError(form: FormGroup, field: string): boolean {
    const c = form.get(field);
    return !!(c?.invalid && c?.touched);
  }
}

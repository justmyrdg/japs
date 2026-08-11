import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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

export interface RouteStopPoint {
  id?: number;
  name: string;
  km_from_origin: number;
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

  // ── Stops ─────────────────────────────────────────────────────────────
  expandedRouteId = signal<number | null>(null);
  routeStops = signal<RouteStopPoint[]>([]);
  loadingStops = signal(false);

  showStopModal = signal(false);
  editingStop = signal<RouteStopPoint | null>(null);
  stopForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    km_from_origin: [null, [Validators.required, Validators.min(0.01)]],
  });

  // Stops queued while creating a brand-new route (no route_id to POST against yet) —
  // created right after the route itself on save().
  pendingStops = signal<RouteStopPoint[]>([]);
  newStopName = signal('');
  newStopKm = signal<number | null>(null);
  pendingStopError = signal<string | null>(null);

  form: FormGroup = this.fb.group({
    origin: ['', Validators.required],
    destination: ['', Validators.required],
    distance_km: [null, [Validators.required, Validators.min(0.01)]],
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
    this.pendingStops.set([]);
    this.newStopName.set('');
    this.newStopKm.set(null);
    this.pendingStopError.set(null);
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

  onNewStopNameInput(e: Event): void {
    this.newStopName.set((e.target as HTMLInputElement).value);
  }

  onNewStopKmInput(e: Event): void {
    const val = (e.target as HTMLInputElement).value;
    this.newStopKm.set(val === '' ? null : Number(val));
  }

  addPendingStop(): void {
    const name = this.newStopName().trim();
    const km = this.newStopKm();
    const distanceKm = Number(this.form.get('distance_km')?.value);

    if (!name || km === null) {
      this.pendingStopError.set('Enter a stop name and distance.');
      return;
    }
    if (!(km > 0) || (distanceKm > 0 && km >= distanceKm)) {
      this.pendingStopError.set(
        distanceKm > 0
          ? `Distance must be between 0 and ${distanceKm} km.`
          : 'Distance must be greater than 0.',
      );
      return;
    }
    if (this.pendingStops().some((s) => Number(s.km_from_origin) === km)) {
      this.pendingStopError.set('A stop already exists at this distance from origin.');
      return;
    }

    this.pendingStops.update((list) =>
      [...list, { name, km_from_origin: km }].sort((a, b) => a.km_from_origin - b.km_from_origin),
    );
    this.newStopName.set('');
    this.newStopKm.set(null);
    this.pendingStopError.set(null);
  }

  removePendingStop(stop: RouteStopPoint): void {
    this.pendingStops.update((list) => list.filter((s) => s !== stop));
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const editing = this.editingRoute();

    if (editing) {
      this.http
        .put<AppRoute>(`${this.API}/${editing.id}`, this.form.value, { withCredentials: true })
        .subscribe({
          next: () => {
            this.alertService.success('Saved', 'Route updated.');
            this.closeModal();
            this.loadRoutes();
          },
          error: (err) =>
            this.alertService.error('Error', err.error?.message ?? 'Something went wrong.'),
        });
      return;
    }

    this.http.post<AppRoute>(this.API, this.form.value, { withCredentials: true }).subscribe({
      next: async (route) => {
        let stopFailure: string | null = null;
        for (const stop of this.pendingStops()) {
          try {
            await firstValueFrom(
              this.http.post(`${this.API}/${route.id}/stops`, stop, { withCredentials: true }),
            );
          } catch (err: any) {
            stopFailure = `"${stop.name}" failed to save: ${err.error?.message ?? 'Something went wrong.'}`;
            break;
          }
        }
        if (stopFailure) {
          this.alertService.error('Route created, but a stop failed', stopFailure);
        } else {
          this.alertService.success('Saved', 'Route created.');
        }
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

  toggleStops(route: AppRoute): void {
    if (this.expandedRouteId() === route.id) {
      this.expandedRouteId.set(null);
      return;
    }
    this.expandedRouteId.set(route.id);
    this.loadStops(route.id);
  }

  loadStops(routeId: number): void {
    this.loadingStops.set(true);
    this.http
      .get<RouteStopPoint[]>(`${this.API}/${routeId}/stops`, { withCredentials: true })
      .subscribe({
        next: (data) => {
          this.routeStops.set(data);
          this.loadingStops.set(false);
        },
        error: () => this.loadingStops.set(false),
      });
  }

  openAddStop(): void {
    this.editingStop.set(null);
    this.stopForm.reset();
    this.showStopModal.set(true);
  }

  openEditStop(stop: RouteStopPoint): void {
    this.editingStop.set(stop);
    this.stopForm.patchValue(stop);
    this.showStopModal.set(true);
  }

  closeStopModal(): void {
    this.showStopModal.set(false);
  }

  saveStop(): void {
    if (this.stopForm.invalid) {
      this.stopForm.markAllAsTouched();
      return;
    }
    const routeId = this.expandedRouteId();
    if (!routeId) return;
    const editing = this.editingStop();
    const req = editing
      ? this.http.put<RouteStopPoint>(
          `${this.API}/${routeId}/stops/${editing.id}`,
          this.stopForm.value,
          { withCredentials: true },
        )
      : this.http.post<RouteStopPoint>(`${this.API}/${routeId}/stops`, this.stopForm.value, {
          withCredentials: true,
        });
    req.subscribe({
      next: () => {
        this.alertService.success('Saved', editing ? 'Stop updated.' : 'Stop added.');
        this.closeStopModal();
        this.loadStops(routeId);
      },
      error: (err) =>
        this.alertService.error('Error', err.error?.message ?? 'Something went wrong.'),
    });
  }

  deleteStop(stop: RouteStopPoint): void {
    const routeId = this.expandedRouteId();
    if (!routeId || !stop.id) return;
    this.http.delete(`${this.API}/${routeId}/stops/${stop.id}`, { withCredentials: true }).subscribe({
      next: () => {
        this.alertService.success('Deleted', 'Stop removed.');
        this.loadStops(routeId);
      },
      error: (err) =>
        this.alertService.error('Error', err.error?.message ?? 'Could not delete stop.'),
    });
  }

  fieldError(form: FormGroup, field: string): boolean {
    const c = form.get(field);
    return !!(c?.invalid && c?.touched);
  }
}

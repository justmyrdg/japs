import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { AlertService } from '../../../../core/services/alert.service';
import { environment } from '../../../../../environments/environment';
import { TablePagination } from '../../../../shared/components/table-pagination/table-pagination';

export interface Trip {
  id: number;
  trip_number: number;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  departure_time: string;
  arrival_time: string | null;
  grand_total: number;
  ticket_number_start: string | null;
  ticket_number_end: string | null;
  BusModel?: { id: number; bus_number: string; plate_number: string; capacity: number };
  Route?: {
    id: number;
    origin: string;
    destination: string;
    distance_km: number;
    minimum_fare: number;
    rate_per_km: number;
  };
  driver?: { id: number; first_name: string; last_name: string; employee_id: string };
}

type TripTab = 'today' | 'all';
type ViewMode = 'card' | 'table';

@Component({
  selector: 'app-conductor-dashboard',
  imports: [DatePipe, CurrencyPipe, RouterLink, TablePagination],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class ConductorDashboard implements OnInit {
  private http = inject(HttpClient);
  private alertService = inject(AlertService);
  private router = inject(Router);

  private readonly API = `${environment.apiUrl}/api/conductor`;

  trips = signal<Trip[]>([]);
  loading = signal(false);
  updatingId = signal<number | null>(null);
  activeTab = signal<TripTab>('today');
  viewMode = signal<ViewMode>('card');
  pageSize = signal(9);
  currentPage = signal(1);
  readonly PAGE_SIZES = [6, 9, 18, 36];

  // Today's date string for comparison
  private todayStr = new Date().toISOString().split('T')[0];

  todayTrips = computed(() =>
    this.trips().filter((t) => {
      const d = t.departure_time?.split('T')[0];
      return d === this.todayStr;
    }),
  );

  // "All" tab = scheduled today + ongoing + completed/cancelled (history)
  allTrips = computed(() => this.trips());

  filteredTrips = computed(() =>
    this.activeTab() === 'today' ? this.todayTrips() : this.allTrips(),
  );

  // Pagination
  totalItems = computed(() => this.filteredTrips().length);
  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));
  pageStart = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  pageEnd = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalItems()));

  displayedTrips = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredTrips().slice(start, start + this.pageSize());
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

  // Counts for badge indicators
  ongoingCount = computed(() => this.trips().filter((t) => t.status === 'ongoing').length);
  scheduledTodayCount = computed(
    () => this.todayTrips().filter((t) => t.status === 'scheduled').length,
  );

  constructor() {
    // Reset page on tab change
    effect(
      () => {
        this.activeTab();
        this.currentPage.set(1);
      },
      { allowSignalWrites: true },
    );
  }

  ngOnInit(): void {
    this.loadTrips();
  }

  loadTrips(): void {
    this.loading.set(true);
    this.http.get<Trip[]>(`${this.API}/trips`, { withCredentials: true }).subscribe({
      next: (data) => {
        this.trips.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.alertService.error('Error', 'Failed to load assigned trips.');
      },
    });
  }

  updateStatus(tripId: number, status: 'ongoing' | 'completed' | 'cancelled'): void {
    this.updatingId.set(tripId);
    this.http
      .put<Trip>(`${this.API}/trips/${tripId}/status`, { status }, { withCredentials: true })
      .subscribe({
        next: () => {
          this.updatingId.set(null);
          this.alertService.success('Success', `Trip status updated to ${status}.`);
          this.loadTrips();
        },
        error: (err) => {
          this.updatingId.set(null);
          this.alertService.error('Error', err.error?.message ?? 'Failed to update trip status.');
        },
      });
  }

  getStatusBadgeClass(status: string): string {
    const map: Record<string, string> = {
      scheduled: 'bg-blue-50 text-blue-600 border-blue-100',
      ongoing: 'bg-amber-50 text-amber-600 border-amber-100',
      completed: 'bg-green-50 text-green-600 border-green-100',
      cancelled: 'bg-red-50 text-red-600 border-red-100',
    };
    return map[status] ?? 'bg-gray-50 text-gray-500 border-gray-100';
  }

  setPage(page: number): void {
    this.currentPage.set(page);
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }
}

import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AlertService } from '../../../../core/services/alert.service';
import { environment } from '../../../../../environments/environment';

export interface ScheduleTrip {
  id: number;
  bus_id: number;
  route_id: number;
  driver_id: number;
  conductor_id: number;
  trip_number: number;
  departure_time: string;
  status: string;
  BusModel?: { id: number; bus_number: string; plate_number: string };
  Route?: { id: number; origin: string; destination: string };
  driver?: { id: number; first_name: string; last_name: string };
  conductor?: { id: number; first_name: string; last_name: string };
}

export interface ScheduleBus {
  id: number;
  bus_number: string;
  plate_number: string;
  driver_id: number | null;
  conductor_id: number | null;
  route_id: number | null;
  assignedDriver?: { id: number; first_name: string; last_name: string } | null;
  assignedConductor?: { id: number; first_name: string; last_name: string } | null;
  defaultRoute?: { id: number; origin: string; destination: string } | null;
}

export interface ScheduleRoute {
  id: number;
  origin: string;
  destination: string;
}

@Component({
  selector: 'app-schedules',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './schedules.html',
  styleUrl: './schedules.css',
})
export class Schedules implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private alertService = inject(AlertService);

  private readonly BUSES_API = `${environment.apiUrl}/api/buses`;

  private allTrips = signal<ScheduleTrip[]>([]);
  loading = signal(false);
  buses = signal<ScheduleBus[]>([]);
  routes = signal<ScheduleRoute[]>([]);

  startDate = signal<string>(this.tomorrow());
  endDate   = signal<string>(this.tomorrow());

  filterBus = signal('');
  filterDriver = signal('');
  filterConductor = signal('');
  filterRoute = signal('');

  filtered = computed(() => {
    const bus = this.filterBus();
    const driver = this.filterDriver();
    const conductor = this.filterConductor();
    const route = this.filterRoute();
    return this.allTrips().filter((t) => {
      if (bus && t.bus_id !== Number(bus)) return false;
      if (driver && t.driver_id !== Number(driver)) return false;
      if (conductor && t.conductor_id !== Number(conductor)) return false;
      if (route && t.route_id !== Number(route)) return false;
      return true;
    });
  });

  tripDrivers = computed(() => {
    const seen = new Set<number>();
    return this.allTrips()
      .filter((t) => t.driver && !seen.has(t.driver_id) && !!seen.add(t.driver_id))
      .map((t) => ({ id: t.driver_id, name: `${t.driver!.first_name} ${t.driver!.last_name}` }));
  });

  tripConductors = computed(() => {
    const seen = new Set<number>();
    return this.allTrips()
      .filter((t) => t.conductor && !seen.has(t.conductor_id) && !!seen.add(t.conductor_id))
      .map((t) => ({ id: t.conductor_id, name: `${t.conductor!.first_name} ${t.conductor!.last_name}` }));
  });

  showModal = signal(false);
  selectedBus = signal<ScheduleBus | null>(null);
  deletingTrip = signal<ScheduleTrip | null>(null);
  showDeleteModal = signal(false);

  form: FormGroup = this.fb.group({
    bus_id: [null, Validators.required],
    route_id: [null, Validators.required],
    driver_id: [null, Validators.required],
    conductor_id: [null, Validators.required],
    trip_number: ['', [Validators.required, Validators.min(1)]],
    departure_time: ['', Validators.required],
  });

  private tomorrow(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  get dateLabel(): string {
    const fmt = (s: string) =>
      new Date(s + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    if (this.startDate() === this.endDate()) return fmt(this.startDate());
    return `${fmt(this.startDate())} — ${fmt(this.endDate())}`;
  }

  ngOnInit(): void {
    this.loadBuses();
    this.loadRoutes();
    this.loadTrips();
  }

  loadTrips(): void {
    this.loading.set(true);
    this.filterBus.set('');
    this.filterDriver.set('');
    this.filterConductor.set('');
    this.filterRoute.set('');
    const url = `${this.BUSES_API}/trips?startDate=${this.startDate()}&endDate=${this.endDate()}`;
    this.http.get<ScheduleTrip[]>(url, { withCredentials: true }).subscribe({
      next: (data) => { this.allTrips.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onStartDateChange(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.startDate.set(v);
    // If end is before new start, clamp it
    if (this.endDate() < v) this.endDate.set(v);
    this.loadTrips();
  }

  onEndDateChange(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.endDate.set(v);
    // If start is after new end, clamp it
    if (this.startDate() > v) this.startDate.set(v);
    this.loadTrips();
  }

  loadBuses(): void {
    this.http.get<ScheduleBus[]>(this.BUSES_API, { withCredentials: true }).subscribe({
      next: (data) => this.buses.set(data),
    });
  }

  loadRoutes(): void {
    this.http.get<ScheduleRoute[]>(`${this.BUSES_API}/routes`, { withCredentials: true }).subscribe({
      next: (data) => this.routes.set(data),
    });
  }

  onBusChange(e: Event): void {
    const id = Number((e.target as HTMLSelectElement).value);
    const bus = this.buses().find((b) => b.id === id) ?? null;
    this.selectedBus.set(bus);
    this.form.patchValue({
      bus_id: bus?.id ?? null,
      driver_id: bus?.driver_id ?? null,
      conductor_id: bus?.conductor_id ?? null,
      route_id: bus?.route_id ?? null,
    });
  }

  openAdd(): void {
    this.form.reset();
    this.selectedBus.set(null);
    this.form.patchValue({ departure_time: `${this.startDate()}T06:00` });
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.http.post<ScheduleTrip>(`${this.BUSES_API}/trips`, this.form.value, { withCredentials: true }).subscribe({
      next: () => { this.alertService.success('Saved', 'Trip scheduled.'); this.closeModal(); this.loadTrips(); },
      error: (err) => this.alertService.error('Error', err.error?.message ?? 'Could not create trip.'),
    });
  }

  confirmDelete(trip: ScheduleTrip): void { this.deletingTrip.set(trip); this.showDeleteModal.set(true); }
  cancelDelete(): void { this.showDeleteModal.set(false); }

  deleteTrip(): void {
    const trip = this.deletingTrip();
    if (!trip) return;
    this.http.delete(`${this.BUSES_API}/trips/${trip.id}`, { withCredentials: true }).subscribe({
      next: () => { this.alertService.success('Deleted', 'Trip removed.'); this.showDeleteModal.set(false); this.loadTrips(); },
      error: (err) => this.alertService.error('Error', err.error?.message ?? 'Could not delete trip.'),
    });
  }

  fieldError(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && c?.touched);
  }
}

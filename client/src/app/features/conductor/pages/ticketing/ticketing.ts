import { Component, ElementRef, inject, signal, computed, viewChild, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { AlertService } from '../../../../core/services/alert.service';
import { PrinterSetupService } from '../../../../core/services/printer-setup.service';
import { environment } from '../../../../../environments/environment';

export interface Trip {
  id: number;
  trip_number: number;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  departure_time: string;
  grand_total: number;
  ticket_number_start: string | null;
  ticket_number_end: string | null;
  BusModel?: {
    id: number;
    bus_number: string;
    plate_number: string;
    capacity: number;
  };
  Route?: {
    id: number;
    origin: string;
    destination: string;
    distance_km: number;
  };
}

export interface FareSettings {
  minimum_fare: number;
  base_distance_km: number;
  rate_per_km: number;
  regular_discount_percent: number;
  student_discount_percent: number;
  senior_citizen_discount_percent: number;
  pwd_discount_percent: number;
  discounted_discount_percent: number;
}

export interface PassengerCount {
  id: number;
  category: string;
  count: number;
}

export interface RouteStopPoint {
  name: string;
  km_from_origin: number;
}

@Component({
  selector: 'app-ticketing',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './ticketing.html',
  styleUrl: './ticketing.css',
})
export class TicketingPage implements OnInit {
  private http = inject(HttpClient);
  private alertService = inject(AlertService);
  private printerSetup = inject(PrinterSetupService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  private readonly API = `${environment.apiUrl}/api/conductor`;

  trips = signal<Trip[]>([]);
  selectedTripId = signal<number | null>(null);
  selectedTrip = computed(() => this.trips().find((t) => t.id === this.selectedTripId()) || null);
  fareSettings = signal<FareSettings | null>(null);
  routeStops = signal<RouteStopPoint[]>([]);

  passengerCounts = signal<PassengerCount[]>([]);
  ticketForm: FormGroup;
  isPrinting = signal(false);

  // Thermal print modal
  showPrintModal = signal(false);
  lastPrintedTicket = signal<any | null>(null);
  private receiptContentRef = viewChild<ElementRef<HTMLElement>>('receiptContent');

  constructor() {
    this.ticketForm = this.fb.group({
      category: ['regular', Validators.required],
      boarding_km: [null, Validators.required],
      dropping_km: [null, Validators.required],
      fare: [0, [Validators.required, Validators.min(0)]],
    });
  }

  ngOnInit(): void {
    this.loadFareSettings();
    this.loadTrips(() => {
      // Check query params for active trip
      this.route.queryParams.subscribe((params) => {
        const tripId = Number(params['tripId']);
        if (tripId) {
          this.selectTrip(tripId);
        }
      });
    });

    // Auto-calculate fare when category or the selected stops change
    this.ticketForm.get('category')?.valueChanges.subscribe(() => {
      this.autoCalculateFare();
    });
    this.ticketForm.get('boarding_km')?.valueChanges.subscribe((val) => {
      const droppingKm = this.ticketForm.get('dropping_km')?.value;
      if (droppingKm !== null && Number(droppingKm) === Number(val)) {
        this.ticketForm.patchValue({ dropping_km: null }, { emitEvent: false });
      }
      this.autoCalculateFare();
    });
    this.ticketForm.get('dropping_km')?.valueChanges.subscribe(() => {
      this.autoCalculateFare();
    });
  }

  loadFareSettings(): void {
    this.http
      .get<FareSettings>(`${environment.apiUrl}/api/fare-settings`, { withCredentials: true })
      .subscribe({
        next: (data) => {
          console.log('Fare settings loaded successfully:', data);
          this.fareSettings.set(data);
          // Trigger calculation after settings are loaded
          this.autoCalculateFare();
        },
        error: (err) => {
          console.error('Failed to load fare settings:', err);
          this.alertService.error('Error', 'Failed to load fare settings.');
        },
      });
  }

  loadTrips(callback?: () => void): void {
    this.http.get<Trip[]>(`${this.API}/trips`, { withCredentials: true }).subscribe({
      next: (data) => {
        // Filter ongoing or completed trips
        this.trips.set(data.filter((t) => t.status === 'ongoing' || t.status === 'completed'));
        if (callback) callback();
      },
      error: () => this.alertService.error('Error', 'Failed to load assigned trips.'),
    });
  }

  selectTrip(tripId: number): void {
    this.selectedTripId.set(tripId);
    this.loadPassengerCounts(tripId);
    this.ticketForm.patchValue({ boarding_km: null, dropping_km: null }, { emitEvent: false });
    const routeId = this.selectedTrip()?.Route?.id;
    if (routeId) this.loadRouteStops(routeId);
    this.autoCalculateFare();
  }

  loadRouteStops(routeId: number): void {
    this.http
      .get<RouteStopPoint[]>(`${this.API}/routes/${routeId}/stops`, { withCredentials: true })
      .subscribe({
        next: (data) => this.routeStops.set(data),
        error: () => this.alertService.error('Error', 'Failed to load route stops.'),
      });
  }

  getDroppingOptions(): RouteStopPoint[] {
    const boardingKm = this.ticketForm.get('boarding_km')?.value;
    return this.routeStops().filter(
      (s) => boardingKm === null || boardingKm === undefined || Number(s.km_from_origin) !== Number(boardingKm),
    );
  }

  computeDistance(): number {
    const boardingKm = this.ticketForm.get('boarding_km')?.value;
    const droppingKm = this.ticketForm.get('dropping_km')?.value;
    if (boardingKm === null || boardingKm === undefined || droppingKm === null || droppingKm === undefined) {
      return 0;
    }
    return Math.abs(Number(droppingKm) - Number(boardingKm));
  }

  loadPassengerCounts(tripId: number): void {
    this.http
      .get<PassengerCount[]>(`${this.API}/trips/${tripId}/passenger-counts`, {
        withCredentials: true,
      })
      .subscribe({
        next: (data) => this.passengerCounts.set(data),
      });
  }

  autoCalculateFare(): void {
    const settings = this.fareSettings();
    if (!settings) return;

    const distance = this.computeDistance();
    if (distance <= 0) {
      this.ticketForm.patchValue({ fare: 0 }, { emitEvent: false });
      return;
    }

    const minFare = Number(settings.minimum_fare);
    const baseDistanceKm = Number(settings.base_distance_km);
    const ratePerKm = Number(settings.rate_per_km);

    const baseFare =
      distance <= baseDistanceKm ? minFare : minFare + (distance - baseDistanceKm) * ratePerKm;

    const category = this.ticketForm.get('category')?.value;
    const discountPercent = this.getDiscountPercent(category, settings);

    const finalFare = parseFloat((baseFare * (1 - discountPercent / 100)).toFixed(2));
    this.ticketForm.patchValue({ fare: finalFare }, { emitEvent: false });
  }

  printTicketSubmit(): void {
    if (this.ticketForm.invalid) {
      this.ticketForm.markAllAsTouched();
      return;
    }

    const tripId = this.selectedTripId();
    if (!tripId) return;

    this.isPrinting.set(true);
    const formValue = this.ticketForm.value;
    const payload = {
      category: formValue.category,
      boarding_km: formValue.boarding_km,
      dropping_km: formValue.dropping_km,
    };

    this.http
      .post<any>(`${this.API}/trips/${tripId}/tickets`, payload, { withCredentials: true })
      .subscribe({
        next: async (res) => {
          this.isPrinting.set(false);
          const printed = {
            ticketNumber: res.ticket?.ticket_number,
            category: payload.category,
            boardingPoint: res.ticket?.boarding_point,
            droppingPoint: res.ticket?.dropping_point,
            distance: res.ticket?.distance_km,
            fare: res.ticket?.fare,
            discountPercent: this.getDiscountPercent(payload.category),
            date: new Date(),
            route: this.selectedTrip()?.Route,
            bus: this.selectedTrip()?.BusModel,
          };
          this.lastPrintedTicket.set(printed);
          this.showPrintModal.set(true);

          // Wait for the modal (and its receipt content ref) to actually render.
          await this.waitForRender();
          const receiptEl = this.receiptContentRef()?.nativeElement;
          if (receiptEl) {
            this.printerSetup.printTicketImage(receiptEl).catch((err) => {
              this.alertService.error(
                'Printer Error',
                err instanceof Error
                  ? err.message
                  : 'Ticket saved, but printing failed. Check the printer connection.',
              );
            });
          }

          this.alertService.success('Success', 'Ticket generated and sent to printing terminal.');

          // Refresh local trip info & counts
          this.loadTrips();
          this.loadPassengerCounts(tripId);
        },
        error: (err) => {
          this.isPrinting.set(false);
          this.alertService.error('Error', err.error?.message ?? 'Failed to print ticket.');
        },
      });
  }

  /** Resolves after the browser has painted at least one frame, so a just-set signal
   *  (e.g. showPrintModal) is guaranteed to be reflected in the DOM before it's read. */
  private waitForRender(): Promise<void> {
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }

  closePrintModal(): void {
    this.showPrintModal.set(false);
  }

  triggerBrowserPrint(): void {
    window.print();
  }

  getDiscountPercent(category: string, settings: FareSettings | null = this.fareSettings()): number {
    if (!settings) return 0;
    switch (category) {
      case 'regular':
        return Number(settings.regular_discount_percent);
      case 'student':
        return Number(settings.student_discount_percent);
      case 'senior_citizen':
        return Number(settings.senior_citizen_discount_percent);
      case 'pwd':
        return Number(settings.pwd_discount_percent);
      case 'discounted':
        return Number(settings.discounted_discount_percent);
      default:
        return 0;
    }
  }

  getCategoryLabel(cat: string): string {
    const labels: Record<string, string> = {
      regular: 'Regular',
      student: 'Student',
      senior_citizen: 'Senior Citizen',
      pwd: 'PWD',
      discounted: 'Discounted',
    };
    return labels[cat] ?? cat;
  }
}

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
      distance: [5, [Validators.required, Validators.min(0.1)]],
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

    // Auto-calculate fare when category or distance changes
    this.ticketForm.get('category')?.valueChanges.subscribe(() => {
      console.log('Category changed to:', this.ticketForm.get('category')?.value);
      this.autoCalculateFare();
    });
    this.ticketForm.get('distance')?.valueChanges.subscribe((val) => {
      console.log('Distance changed to:', val);
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
    this.autoCalculateFare();
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
    if (!settings) {
      console.log('No fare settings available yet');
      return;
    }

    const distanceValue = this.ticketForm.get('distance')?.value;
    const distance = Number(distanceValue);

    console.log('Starting fare calculation with distance:', distanceValue, '-> parsed:', distance);

    if (!distanceValue || distance <= 0) {
      console.log('Invalid distance, setting fare to 0');
      this.ticketForm.patchValue({ fare: 0 }, { emitEvent: false });
      return;
    }

    const minFare = Number(settings.minimum_fare);
    const baseDistanceKm = Number(settings.base_distance_km);
    const ratePerKm = Number(settings.rate_per_km);

    console.log('Fare settings:', {
      minFare,
      baseDistanceKm,
      ratePerKm,
      allSettings: settings,
    });

    // Calculate base fare: if distance <= base_distance_km, use min_fare, otherwise add per-km
    const baseFare =
      distance <= baseDistanceKm ? minFare : minFare + (distance - baseDistanceKm) * ratePerKm;

    console.log(
      'Base fare calculated:',
      baseFare,
      `(${distance <= baseDistanceKm ? 'minimum fare' : 'minimum + extra km'})`,
    );

    // Apply category discount percentage
    const category = this.ticketForm.get('category')?.value;
    const discountPercent = this.getDiscountPercent(category, settings);

    console.log('Category:', category, 'Discount:', discountPercent, '%');

    const finalFare = parseFloat((baseFare * (1 - discountPercent / 100)).toFixed(2));
    console.log('FINAL FARE:', finalFare);

    // Patch without emitting event to prevent infinite loop
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
      distance: formValue.distance,
      fare: formValue.fare,
    };

    this.http
      .post<any>(`${this.API}/trips/${tripId}/tickets`, payload, { withCredentials: true })
      .subscribe({
        next: async (res) => {
          this.isPrinting.set(false);
          const printed = {
            ticketNumber: res.ticket?.ticket_number,
            category: payload.category,
            distance: payload.distance,
            fare: payload.fare,
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

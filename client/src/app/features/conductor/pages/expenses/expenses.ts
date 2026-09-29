import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { AlertService } from '../../../../core/services/alert.service';
import { environment } from '../../../../../environments/environment';
import { EXPENSE_TYPES, expenseTypeLabel } from '../../../../shared/constants/expense-types';
import { passengerCategoryLabel } from '../../../../shared/models/ticket.models';

interface ExpenseTrip {
  id: number;
  trip_number: number;
  status: string;
  departure_time: string;
  BusModel?: { id: number; bus_number: string; plate_number: string };
  Route?: { origin: string; destination: string };
}

interface PassengerCount {
  category: string;
  count: number;
}

interface LoggedExpense {
  id: number;
  trip_id: number | null;
  date: string;
  expense_type: string;
  amount: string | number;
  ticket_number: string | null;
  notes: string | null;
  remittance_id: number | null;
  created_at?: string;
  createdAt?: string;
  Trip?: {
    id: number;
    trip_number: number;
    departure_time: string;
    Route?: { origin: string; destination: string };
  } | null;
  BusModel?: { id: number; bus_number: string } | null;
}

const PASSENGER_ORDER = ['regular', 'student', 'senior_citizen', 'pwd', 'discounted'];

/** YYYY-MM-DD in the browser's local time. */
const localDate = (d: Date | string): string => {
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

@Component({
  selector: 'app-conductor-expenses',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe],
  templateUrl: './expenses.html',
})
export class ConductorExpensesPage implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private alertService = inject(AlertService);

  private readonly API = `${environment.apiUrl}/api/conductor`;
  readonly EXPENSE_TYPES = EXPENSE_TYPES;

  selectedDate = signal(localDate(new Date()));
  private allTrips = signal<ExpenseTrip[]>([]);
  tripsForDate = computed(() =>
    this.allTrips().filter(
      (t) => t.status !== 'cancelled' && localDate(t.departure_time) === this.selectedDate(),
    ),
  );

  selectedTripId = signal<number | null>(null);
  selectedTrip = computed(() => this.allTrips().find((t) => t.id === this.selectedTripId()) ?? null);
  tripPassengers = signal<PassengerCount[]>([]);
  loadingPassengers = signal(false);
  totalTripPassengers = computed(() =>
    this.tripPassengers().reduce((sum, c) => sum + Number(c.count), 0),
  );

  expenses = signal<LoggedExpense[]>([]);
  loadingExpenses = signal(false);
  isSubmitting = signal(false);
  totalLogged = computed(() => this.expenses().reduce((sum, e) => sum + Number(e.amount), 0));

  form: FormGroup = this.fb.group({
    trip_id: [null as number | null, Validators.required],
    expense_type: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    ticket_number: [''],
    notes: [''],
  });

  ngOnInit(): void {
    this.http.get<ExpenseTrip[]>(`${this.API}/trips`, { withCredentials: true }).subscribe({
      next: (trips) => {
        this.allTrips.set(trips);
        this.autoSelectTrip();
      },
      error: () => this.alertService.error('Error', 'Failed to load your trips.'),
    });
    this.form.get('trip_id')!.valueChanges.subscribe((id) => this.onTripSelected(id));
    this.loadExpenses();
  }

  onDateChange(e: Event): void {
    this.selectedDate.set((e.target as HTMLInputElement).value);
    this.autoSelectTrip();
    this.loadExpenses();
  }

  /** Defaults to the day's ongoing trip, else its only trip, else nothing. */
  private autoSelectTrip(): void {
    const trips = this.tripsForDate();
    const pick = trips.find((t) => t.status === 'ongoing') ?? (trips.length === 1 ? trips[0] : null);
    this.form.patchValue({ trip_id: pick?.id ?? null });
  }

  private onTripSelected(id: number | null): void {
    this.selectedTripId.set(id != null ? Number(id) : null);
    this.tripPassengers.set([]);
    if (id == null) return;
    this.loadingPassengers.set(true);
    this.http
      .get<PassengerCount[]>(`${this.API}/trips/${id}/passenger-counts`, { withCredentials: true })
      .subscribe({
        next: (counts) => {
          this.tripPassengers.set(
            [...counts].sort(
              (a, b) => PASSENGER_ORDER.indexOf(a.category) - PASSENGER_ORDER.indexOf(b.category),
            ),
          );
          this.loadingPassengers.set(false);
        },
        error: () => this.loadingPassengers.set(false),
      });
  }

  loadExpenses(): void {
    this.loadingExpenses.set(true);
    this.http
      .get<LoggedExpense[]>(`${this.API}/expenses`, {
        params: { date: this.selectedDate() },
        withCredentials: true,
      })
      .subscribe({
        next: (data) => {
          this.expenses.set(data);
          this.loadingExpenses.set(false);
        },
        error: () => {
          this.loadingExpenses.set(false);
          this.alertService.error('Error', 'Failed to load expenses.');
        },
      });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    this.isSubmitting.set(true);
    this.http
      .post<LoggedExpense>(
        `${this.API}/expenses`,
        {
          trip_id: Number(v.trip_id),
          expense_type: v.expense_type,
          amount: Number(v.amount),
          ticket_number: v.ticket_number?.toString().trim() || null,
          notes: v.notes?.trim() || null,
        },
        { withCredentials: true },
      )
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.alertService.success('Submitted', 'Expense submitted successfully.');
          // Keep the trip selected for the next entry; clear the rest.
          this.form.reset({
            trip_id: v.trip_id,
            expense_type: '',
            amount: 0,
            ticket_number: '',
            notes: '',
          });
          this.loadExpenses();
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.alertService.error('Error', err.error?.message ?? 'Failed to submit expense.');
        },
      });
  }

  deleteExpense(expense: LoggedExpense): void {
    this.http
      .delete(`${this.API}/expenses/${expense.id}`, { withCredentials: true })
      .subscribe({
        next: () => {
          this.alertService.success('Removed', 'Expense removed.');
          this.loadExpenses();
        },
        error: (err) =>
          this.alertService.error('Error', err.error?.message ?? 'Could not remove expense.'),
      });
  }

  tripLabel(t: ExpenseTrip): string {
    const route = t.Route ? `${t.Route.origin} → ${t.Route.destination}` : '';
    return `Trip #${t.trip_number} · ${route} · Bus ${t.BusModel?.bus_number ?? ''} (${t.status})`;
  }

  expenseLabel(type: string): string {
    return expenseTypeLabel(type);
  }

  categoryLabel(category: string): string {
    return passengerCategoryLabel(category);
  }

  fieldError(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && c?.touched);
  }
}

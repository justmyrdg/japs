import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { AlertService } from '../../../../core/services/alert.service';
import { environment } from '../../../../../environments/environment';

interface RemittanceDetail {
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
  status: 'submitted' | 'approved' | 'rejected';
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

@Component({
  selector: 'app-remittance-review',
  imports: [RouterLink, CurrencyPipe, DatePipe, TitleCasePipe],
  templateUrl: './remittance-review.html',
})
export class RemittanceReviewPage implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private alertService = inject(AlertService);
  private readonly API = `${environment.apiUrl}/api/audit-teller`;

  remittance = signal<RemittanceDetail | null>(null);
  loading = signal(true);
  submitting = signal(false);
  rejectReason = signal('');
  showRejectModal = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.http
      .get<RemittanceDetail>(`${this.API}/remittances/${id}`, { withCredentials: true })
      .subscribe({
        next: (data) => {
          this.remittance.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.alertService.error('Error', 'Failed to load remittance.');
          this.loading.set(false);
        },
      });
  }

  approve(): void {
    const r = this.remittance();
    if (!r) return;
    this.submitting.set(true);
    this.http
      .put(`${this.API}/remittances/${r.id}/approve`, {}, { withCredentials: true })
      .subscribe({
        next: () => {
          this.alertService.success('Approved', 'Remittance has been approved.');
          this.router.navigate(['/audit-teller/remittances']);
        },
        error: () => {
          this.submitting.set(false);
          this.alertService.error('Error', 'Failed to approve remittance.');
        },
      });
  }

  openRejectModal(): void {
    this.rejectReason.set('');
    this.showRejectModal.set(true);
  }

  closeRejectModal(): void {
    this.showRejectModal.set(false);
  }

  confirmReject(): void {
    const r = this.remittance();
    if (!r) return;
    this.submitting.set(true);
    this.showRejectModal.set(false);
    this.http
      .put(
        `${this.API}/remittances/${r.id}/reject`,
        { reason: this.rejectReason() },
        { withCredentials: true },
      )
      .subscribe({
        next: () => {
          this.alertService.success('Rejected', 'Remittance has been rejected.');
          this.router.navigate(['/audit-teller/remittances']);
        },
        error: () => {
          this.submitting.set(false);
          this.alertService.error('Error', 'Failed to reject remittance.');
        },
      });
  }

  getStatusBadge(status: string): string {
    const badges: Record<string, string> = {
      submitted: 'bg-amber-100 text-amber-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return badges[status] ?? 'bg-gray-100 text-gray-800';
  }

  formatExpenseType(type: string): string {
    const labels: Record<string, string> = {
      officer: 'Officer / Police',
      toll_fees: 'Toll Fees',
      parking: 'Parking',
      ppa: 'PPA (Port Authority)',
      washing: 'Bus Washing',
      diesel: 'Diesel / Fuel',
      caller_grand_terminal: 'Caller (Grand Terminal)',
      caller_calamba_terminal: 'Caller (Calamba Terminal)',
      pwd: 'PWD / Senior Discount',
      miscellaneous: 'Miscellaneous',
    };
    return labels[type] ?? type;
  }

  onRejectReasonChange(e: Event): void {
    this.rejectReason.set((e.target as HTMLTextAreaElement).value);
  }
}

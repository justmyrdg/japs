import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  teller_remarks: string | null;
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

interface EditForm {
  gross_income: number;
  total_expenses: number;
  driver_commission: number;
  conductor_commission: number;
  bonus_allowance: number;
  other_deductions: number;
  cash_deposit: number;
  driver_officer_share: number;
  conductor_officer_share: number;
  teller_remarks: string;
  [key: string]: number | string; // allow string indexing for template loops
}

@Component({
  selector: 'app-remittance-review',
  imports: [RouterLink, CurrencyPipe, DatePipe, FormsModule],
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
  saving = signal(false);
  rejectReason = signal('');
  editMode = signal(false);

  // edit form values (two-way bound via FormsModule)
  form: EditForm = this.emptyForm();

  // original values snapshot to detect changes
  private original: EditForm = this.emptyForm();

  changedFields = signal<Set<string>>(new Set());

  // recalculated derived totals for live preview
  previewNetGross = computed(
    () => Number(this.form.gross_income) - Number(this.form.total_expenses),
  );
  previewTotalLess = computed(
    () =>
      Number(this.form.driver_commission) +
      Number(this.form.conductor_commission) +
      Number(this.form.bonus_allowance || 0) +
      Number(this.form.other_deductions || 0) +
      Number(this.form.cash_deposit),
  );
  previewNetCollection = computed(() => this.previewNetGross() - this.previewTotalLess());

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.http
      .get<RemittanceDetail>(`${this.API}/remittances/${id}`, { withCredentials: true })
      .subscribe({
        next: (data) => {
          this.remittance.set(data);
          this.loading.set(false);
          this.initForm(data);
        },
        error: () => {
          this.alertService.error('Error', 'Failed to load remittance.');
          this.loading.set(false);
        },
      });
  }

  private emptyForm(): EditForm {
    return {
      gross_income: 0,
      total_expenses: 0,
      driver_commission: 0,
      conductor_commission: 0,
      bonus_allowance: 0,
      other_deductions: 0,
      cash_deposit: 0,
      driver_officer_share: 0,
      conductor_officer_share: 0,
      teller_remarks: '',
    };
  }

  private initForm(r: RemittanceDetail): void {
    this.form = {
      gross_income: Number(r.gross_income),
      total_expenses: Number(r.total_expenses),
      driver_commission: Number(r.driver_commission),
      conductor_commission: Number(r.conductor_commission),
      bonus_allowance: Number(r.bonus_allowance),
      other_deductions: Number(r.other_deductions),
      cash_deposit: Number(r.cash_deposit),
      driver_officer_share: Number(r.driver_officer_share),
      conductor_officer_share: Number(r.conductor_officer_share),
      teller_remarks: r.teller_remarks ?? '',
    };
    this.original = { ...this.form };
    this.changedFields.set(new Set());
  }

  onFieldChange(field: string): void {
    const changed = new Set(this.changedFields());
    if (
      Number(this.form[field]) !== Number(this.original[field]) ||
      String(this.form[field]) !== String(this.original[field])
    ) {
      changed.add(field);
    } else {
      changed.delete(field);
    }
    this.changedFields.set(changed);
  }

  isChanged(field: string): boolean {
    return this.changedFields().has(field);
  }

  /** Safe dynamic accessor for RemittanceDetail fields in template loops */
  remittanceField(field: string): number {
    return (this.remittance() as any)?.[field] ?? 0;
  }

  enterEditMode(): void {
    this.editMode.set(true);
  }

  cancelEdit(): void {
    const r = this.remittance();
    if (r) this.initForm(r);
    this.editMode.set(false);
  }

  saveChanges(): void {
    if (this.changedFields().size === 0) {
      this.editMode.set(false);
      return;
    }
    const r = this.remittance();
    if (!r) return;
    this.saving.set(true);
    this.http
      .put(`${this.API}/remittances/${r.id}`, this.form, { withCredentials: true })
      .subscribe({
        next: (updated: any) => {
          this.remittance.set({ ...r, ...updated });
          this.initForm({ ...r, ...updated });
          this.saving.set(false);
          this.editMode.set(false);
          this.alertService.success('Saved', 'Remittance updated successfully.');
        },
        error: () => {
          this.saving.set(false);
          this.alertService.error('Error', 'Failed to save changes.');
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

  reject(): void {
    const r = this.remittance();
    if (!r) return;
    this.submitting.set(true);
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

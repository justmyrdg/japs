import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { environment } from '../../../../../environments/environment';

interface DashboardStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

interface RemittanceSummary {
  id: number;
  date: string;
  net_collection: number;
  status: 'submitted' | 'approved' | 'rejected';
  submitted_at: string;
  approved_at: string | null;
  conductor: { id: number; first_name: string; last_name: string; employee_id: string };
  BusModel: { id: number; bus_number: string; plate_number: string };
  approver: { id: number; first_name: string; last_name: string } | null;
}

interface DayBucket {
  key: string;
  label: string;
  submitted: number;
  approved: number;
  rejected: number;
  netCollection: number;
}

interface AuditorActivity {
  name: string;
  count: number;
  netCollection: number;
}

@Component({
  selector: 'app-audit-teller-dashboard',
  imports: [RouterLink, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class AuditTellerDashboard implements OnInit {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/api/audit-teller`;

  stats = signal<DashboardStats>({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  });
  loading = signal(false);

  private allRemittances = signal<RemittanceSummary[]>([]);
  remittancesLoading = signal(false);

  // Most recently submitted remittances, newest first
  recentRemittances = computed(() => this.allRemittances().slice(0, 8));

  // Remittances still waiting on review, oldest first (most urgent to audit)
  oldestPending = computed(() =>
    this.allRemittances()
      .filter((r) => r.status === 'submitted')
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
      .slice(0, 5),
  );

  ngOnInit(): void {
    this.loadStats();
    this.loadRemittances();
  }

  // ── Status Breakdown donut ──────────────────────────────────────────────
  statusBreakdown = computed(() => {
    const s = this.stats();
    const total = s.total || 1;
    return {
      approvedPct: Math.round((s.approved / total) * 100),
      rejectedPct: Math.round((s.rejected / total) * 100),
      pendingPct: Math.round((s.pending / total) * 100),
    };
  });

  donutGradient = computed(() => {
    const { approvedPct, rejectedPct } = this.statusBreakdown();
    const a = approvedPct;
    const b = approvedPct + rejectedPct;
    return `conic-gradient(#22c55e 0% ${a}%, #ef4444 ${a}% ${b}%, #f59e0b ${b}% 100%)`;
  });

  // ── Last 14 days trend (submissions, audits, net collection) ───────────
  private localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  last14Days = computed<DayBucket[]>(() => {
    const buckets = new Map<string, DayBucket>();
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = this.localDateStr(d);
      buckets.set(key, {
        key,
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        submitted: 0,
        approved: 0,
        rejected: 0,
        netCollection: 0,
      });
    }
    for (const r of this.allRemittances()) {
      const key = r.date?.slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.submitted++;
      if (r.status === 'approved') {
        bucket.approved++;
        bucket.netCollection += Number(r.net_collection) || 0;
      } else if (r.status === 'rejected') {
        bucket.rejected++;
      }
    }
    return [...buckets.values()];
  });

  submittedTrendValues = computed(() => this.last14Days().map((d) => d.submitted));
  maxSubmittedTrend = computed(() => Math.max(...this.submittedTrendValues(), 1));
  netCollectionTrendValues = computed(() => this.last14Days().map((d) => d.netCollection));

  private normalise(values: number[], height: number): number[] {
    const max = Math.max(...values, 1);
    return values.map((v) => height - (v / max) * height);
  }

  polyline(values: number[], width: number, height: number): string {
    if (!values.length) return '';
    const ys = this.normalise(values, height);
    const step = width / Math.max(values.length - 1, 1);
    return ys.map((y, i) => `${i * step},${y}`).join(' ');
  }

  areaPath(values: number[], width: number, height: number): string {
    if (!values.length) return '';
    const ys = this.normalise(values, height);
    const step = width / Math.max(values.length - 1, 1);
    const line = ys.map((y, i) => `${i * step},${y}`).join(' L');
    return `M0,${height} L${line} L${(values.length - 1) * step},${height} Z`;
  }

  // ── Auditor activity ────────────────────────────────────────────────────
  auditorActivity = computed<AuditorActivity[]>(() => {
    const byAuditor = new Map<string, AuditorActivity>();
    for (const r of this.allRemittances()) {
      if (!r.approver) continue;
      const name = `${r.approver.first_name} ${r.approver.last_name}`;
      const entry = byAuditor.get(name) ?? { name, count: 0, netCollection: 0 };
      entry.count++;
      entry.netCollection += Number(r.net_collection) || 0;
      byAuditor.set(name, entry);
    }
    return [...byAuditor.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  });

  maxAuditorCount = computed(() => Math.max(...this.auditorActivity().map((a) => a.count), 1));

  // ── Average audit turnaround (hours between submission and audit) ──────
  avgTurnaroundHours = computed(() => {
    const durations = this.allRemittances()
      .filter((r) => r.approved_at)
      .map((r) => (new Date(r.approved_at!).getTime() - new Date(r.submitted_at).getTime()) / 3600000)
      .filter((h) => h >= 0);
    if (!durations.length) return null;
    return durations.reduce((sum, h) => sum + h, 0) / durations.length;
  });

  loadStats(): void {
    this.loading.set(true);
    this.http.get<DashboardStats>(`${this.API}/stats`, { withCredentials: true }).subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadRemittances(): void {
    this.remittancesLoading.set(true);
    this.http
      .get<RemittanceSummary[]>(`${this.API}/remittances`, { withCredentials: true })
      .subscribe({
        next: (data) => {
          this.allRemittances.set(data);
          this.remittancesLoading.set(false);
        },
        error: () => this.remittancesLoading.set(false),
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
}

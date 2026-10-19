import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
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
  cash_received: number | null;
  status: 'submitted' | 'approved' | 'rejected';
  resubmitted_at?: string | null;
  submitted_at: string;
  approved_at: string | null;
  conductor: { id: number; first_name: string; last_name: string; employee_id: string };
  BusModel: { id: number; bus_number: string; plate_number: string };
  approver: { id: number; first_name: string; last_name: string } | null;
}

interface DayBucket {
  key: string;
  dow: string; // Mon, Tue, …
  short: string; // 10/18
  title: string; // Sat 10/18
  weekend: boolean;
  submitted: number;
  approved: number;
  rejected: number;
  resubmitted: number; // back in the queue after the conductor corrected a rejection
  cashRemitted: number; // cash received on approved remittances
}

interface AuditorActivity {
  name: string;
  count: number;
  cashRemitted: number; // cash received on the remittances this auditor approved
}

@Component({
  selector: 'app-audit-teller-dashboard',
  imports: [RouterLink, CurrencyPipe, DatePipe],
  templateUrl: './dashboard.html',
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

  // ── Last 14 days (cash remitted) / last 7 days (submissions) ───────────
  private localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** "YYYY-MM-DD" as-is; a full timestamp is converted to the local calendar day. */
  private dayKey(value: string | null | undefined): string {
    if (!value) return '';
    if (value.length === 10) return value;
    const d = new Date(value);
    return isNaN(d.getTime()) ? value.slice(0, 10) : this.localDateStr(d);
  }

  last14Days = computed<DayBucket[]>(() => {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const buckets = new Map<string, DayBucket>();
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = this.localDateStr(d);
      const short = `${d.getMonth() + 1}/${d.getDate()}`;
      buckets.set(key, {
        key,
        dow: names[d.getDay()],
        short,
        title: `${names[d.getDay()]} ${short}`,
        weekend: d.getDay() === 0 || d.getDay() === 6,
        submitted: 0,
        approved: 0,
        rejected: 0,
        resubmitted: 0,
        cashRemitted: 0,
      });
    }
    for (const r of this.allRemittances()) {
      const bucket = buckets.get(this.dayKey(r.date));
      if (!bucket) continue;
      // Remittances still waiting for a first review are left out of the submissions chart.
      if (r.status === 'submitted' && !r.resubmitted_at) continue;
      bucket.submitted++;
      if (r.status === 'approved') {
        bucket.approved++;
        if (r.cash_received !== null && r.cash_received !== undefined) {
          bucket.cashRemitted += Number(r.cash_received) || 0;
        }
      } else if (r.status === 'rejected') {
        bucket.rejected++;
      } else {
        bucket.resubmitted++;
      }
    }
    return [...buckets.values()];
  });

  last7Days = computed(() => this.last14Days().slice(-7));

  // Submissions bar chart (last 7 days)
  submittedTotal = computed(() => this.last7Days().reduce((s, d) => s + d.submitted, 0));
  maxSubmitted = computed(() => Math.max(...this.last7Days().map((d) => d.submitted), 1));
  subHoverIndex = signal<number | null>(null);
  subHovered = computed(() => {
    const i = this.subHoverIndex();
    const days = this.last7Days();
    if (i === null || !days[i]) return null;
    return { bar: days[i], xPct: ((i + 0.5) / days.length) * 100 };
  });

  // Cash remitted line chart, last 14 days (points sit at the centre of each day's hover zone)
  private readonly CHART_W = 400;
  cashTotal = computed(() => this.last14Days().reduce((s, d) => s + d.cashRemitted, 0));
  cashPoints = computed(() => {
    const days = this.last14Days();
    const max = Math.max(...days.map((d) => d.cashRemitted), 1);
    return days.map((d, i) => {
      const xPct = ((i + 0.5) / days.length) * 100;
      return { xPct, x: (xPct / 100) * this.CHART_W, y: 94 - (d.cashRemitted / max) * 88 };
    });
  });
  cashLine = computed(() =>
    this.cashPoints()
      .map((p) => `${p.x},${p.y}`)
      .join(' '),
  );
  cashArea = computed(() => {
    const pts = this.cashPoints();
    if (!pts.length) return '';
    const line = pts.map((p) => `${p.x},${p.y}`).join(' L');
    return `M${pts[0].x},100 L${line} L${pts[pts.length - 1].x},100 Z`;
  });
  cashHoverIndex = signal<number | null>(null);
  cashHovered = computed(() => {
    const i = this.cashHoverIndex();
    const days = this.last14Days();
    if (i === null || !days[i]) return null;
    return { day: days[i], point: this.cashPoints()[i] };
  });

  /** Keeps a tooltip inside the card near the left/right edges. */
  tooltipLeft(xPct: number): number {
    return Math.min(86, Math.max(14, xPct));
  }

  // ── Auditor activity ────────────────────────────────────────────────────
  auditorActivity = computed<AuditorActivity[]>(() => {
    const byAuditor = new Map<string, AuditorActivity>();
    for (const r of this.allRemittances()) {
      if (!r.approver) continue;
      const name = `${r.approver.first_name} ${r.approver.last_name}`;
      const entry = byAuditor.get(name) ?? { name, count: 0, cashRemitted: 0 };
      entry.count++;
      if (r.cash_received !== null && r.cash_received !== undefined) {
        entry.cashRemitted += Number(r.cash_received) || 0;
      }
      byAuditor.set(name, entry);
    }
    return [...byAuditor.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  });

  maxAuditorCount = computed(() => Math.max(...this.auditorActivity().map((a) => a.count), 1));

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
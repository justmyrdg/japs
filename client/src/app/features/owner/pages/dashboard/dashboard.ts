import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { environment } from '../../../../../environments/environment';

export type DashboardRangePreset = 'today' | '7d' | 'month' | '30d' | 'custom';

interface DashboardData {
  range: { from: string; to: string };
  kpi: {
    net_gross_in_range: number;
    passenger_count_in_range: number;
    passenger_growth_pct: string | null;
    bus_utilisation_rate: number;
    total_buses: number;
    buses_in_use_today: number;
    remittance_approved: number;
    remittance_total: number;
    remittance_pending: number;
  };
  daily_passengers: { date: string; total: string }[];
  route_profit: {
    route_id: number;
    revenue: string;
    trip_count: string;
    origin: string;
    destination: string;
  }[];
  peak_hours: { hour: number; ticket_count: string }[];
  weekday_weekend: { month: number; dow: number; total: string }[];
  remittance_trend: { year: number; month: number; net_collection: string; gross_income: string }[];
}

interface ForecastData {
  kpi_forecast: {
    predicted_passengers_tomorrow: number;
    passenger_growth_pct_tomorrow: string | null;
    predicted_revenue_tomorrow: number;
    revenue_growth_pct_tomorrow: string | null;
    predicted_bus_utilisation_tomorrow: number;
  };
  demand_series: { date: string; value: number; type: 'actual' | 'forecast' }[];
  revenue_forecast_7d: { date: string; predicted: number }[];
  peak_hours_forecast: { hour: number; avg_tickets: string }[];
  seasonal_factors: { dow: string; factor: number }[];
}

@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/api/owner`;

  loading = signal(true);
  dash = signal<DashboardData | null>(null);
  fore = signal<ForecastData | null>(null);

  // ── Date range filter ─────────────────────────────────────────────────
  rangePreset = signal<DashboardRangePreset>('month');
  customFrom = signal<string>('');
  customTo = signal<string>('');

  readonly RANGE_PRESETS: { value: DashboardRangePreset; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 Days' },
    { value: 'month', label: 'This Month' },
    { value: '30d', label: 'Last 30 Days' },
    { value: 'custom', label: 'Custom Range' },
  ];

  ngOnInit(): void {
    this.fore.set(null);
    this.http
      .get<ForecastData>(`${this.API}/forecast`, { withCredentials: true })
      .subscribe({ next: (fore) => this.fore.set(fore) });
    this.loadDashboard();
  }

  private resolvedRange(): { from: string; to: string } | null {
    const toIso = (d: Date) => d.toISOString().split('T')[0];
    const now = new Date();
    switch (this.rangePreset()) {
      case 'today':
        return { from: toIso(now), to: toIso(now) };
      case '7d': {
        const from = new Date(now);
        from.setDate(from.getDate() - 6);
        return { from: toIso(from), to: toIso(now) };
      }
      case '30d': {
        const from = new Date(now);
        from.setDate(from.getDate() - 29);
        return { from: toIso(from), to: toIso(now) };
      }
      case 'custom':
        return this.customFrom() && this.customTo()
          ? { from: this.customFrom(), to: this.customTo() }
          : null;
      case 'month':
      default:
        return null; // let the server default to the current month
    }
  }

  loadDashboard(): void {
    this.loading.set(true);
    const range = this.resolvedRange();
    let params = new HttpParams();
    if (range) {
      params = params.set('from', range.from).set('to', range.to);
    }
    this.http
      .get<DashboardData>(`${this.API}/dashboard`, { withCredentials: true, params })
      .subscribe({
        next: (dash) => {
          this.dash.set(dash);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  setRangePreset(preset: DashboardRangePreset): void {
    this.rangePreset.set(preset);
    if (preset !== 'custom') this.loadDashboard();
  }

  onCustomFromInput(e: Event): void {
    this.customFrom.set((e.target as HTMLInputElement).value);
  }

  onCustomToInput(e: Event): void {
    this.customTo.set((e.target as HTMLInputElement).value);
  }

  applyCustomRange(): void {
    if (this.customFrom() && this.customTo()) this.loadDashboard();
  }

  // ── SVG helpers ─────────────────────────────────────────────────────────
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

  // ── Dashboard computed ───────────────────────────────────────────────────
  remittanceApprovedPct = computed(() => {
    const d = this.dash();
    if (!d || !d.kpi.remittance_total) return 0;
    return Math.round((d.kpi.remittance_approved / d.kpi.remittance_total) * 100);
  });

  remittancePendingPct = computed(() => {
    const d = this.dash();
    if (!d || !d.kpi.remittance_total) return 0;
    return Math.round((d.kpi.remittance_pending / d.kpi.remittance_total) * 100);
  });

  dailyPassengerBars = computed(() => {
    const d = this.dash();
    if (!d) return [];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const result: { label: string; value: number }[] = [];
    const from = new Date(`${d.range.from}T00:00:00`);
    const to = new Date(`${d.range.to}T00:00:00`);
    for (let dt = new Date(from); dt <= to; dt.setDate(dt.getDate() + 1)) {
      const key = dt.toISOString().split('T')[0];
      const found = d.daily_passengers.find((r) => r.date?.toString().startsWith(key));
      result.push({
        label: days[dt.getDay() === 0 ? 6 : dt.getDay() - 1],
        value: Number(found?.total ?? 0),
      });
    }
    return result;
  });

  maxDailyPassengers = computed(() =>
    Math.max(...this.dailyPassengerBars().map((b) => b.value), 1),
  );

  routeBars = computed(() => {
    const d = this.dash();
    if (!d) return [];
    return d.route_profit.map((r) => ({
      label: `${r.origin} – ${r.destination}`,
      revenue: Number(r.revenue),
    }));
  });

  maxRouteRevenue = computed(() => Math.max(...this.routeBars().map((r) => r.revenue), 1));

  peakHourValues = computed(() => {
    const d = this.dash();
    if (!d) return [];
    const slots = Array(24).fill(0);
    for (const row of d.peak_hours) slots[Number(row.hour)] = Number(row.ticket_count);
    return slots.slice(6, 22);
  });
  peakHourLabels = ['6', '8', '10', '12', '14', '16', '18', '20'];

  remittanceTrendValues = computed(() =>
    (this.dash()?.remittance_trend ?? []).map((r) => Number(r.net_collection)),
  );
  remittanceTrendLabels = computed(() => {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return (this.dash()?.remittance_trend ?? []).map((r) => months[Number(r.month) - 1]);
  });

  weekdayWeekendBars = computed(() => {
    const d = this.dash();
    if (!d) return [];
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const map = new Map<number, { weekday: number; weekend: number }>();
    for (const r of d.weekday_weekend) {
      const m = Number(r.month),
        dow = Number(r.dow);
      const cur = map.get(m) ?? { weekday: 0, weekend: 0 };
      if (dow === 0 || dow === 6) cur.weekend += Number(r.total);
      else cur.weekday += Number(r.total);
      map.set(m, cur);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([month, v]) => ({ label: months[month - 1], ...v }));
  });

  maxWeekdayWeekend = computed(() =>
    Math.max(...this.weekdayWeekendBars().flatMap((b) => [b.weekday, b.weekend]), 1),
  );

  // ── Forecast computed ─────────────────────────────────────────────────────
  splitIndex = computed(
    () => (this.fore()?.demand_series ?? []).filter((p) => p.type === 'actual').length,
  );

  demandLabels = computed(() =>
    (this.fore()?.demand_series ?? []).map((p) => {
      const d = new Date(p.date);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }),
  );

  allDemandValues = computed(() => (this.fore()?.demand_series ?? []).map((p) => p.value));

  actualPolyline = computed(() => {
    const all = this.fore()?.demand_series ?? [];
    const max = Math.max(...all.map((p) => p.value), 1);
    const step = 500 / Math.max(all.length - 1, 1);
    return all
      .filter((p) => p.type === 'actual')
      .map((p, i) => `${i * step},${120 - (p.value / max) * 120}`)
      .join(' ');
  });

  forecastPolyline = computed(() => {
    const all = this.fore()?.demand_series ?? [];
    if (!all.length) return '';
    const max = Math.max(...all.map((p) => p.value), 1);
    const step = 500 / Math.max(all.length - 1, 1);
    const si = this.splitIndex();
    return all
      .slice(si - 1)
      .map((p, i) => `${(si - 1 + i) * step},${120 - (p.value / max) * 120}`)
      .join(' ');
  });

  maxRevenueForecast = computed(() =>
    Math.max(...(this.fore()?.revenue_forecast_7d ?? []).map((r) => r.predicted), 1),
  );

  revenueForecastLabels = computed(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (this.fore()?.revenue_forecast_7d ?? []).map((r) => days[new Date(r.date).getDay()]);
  });

  maxSeasonalFactor = computed(() =>
    Math.max(...(this.fore()?.seasonal_factors ?? []).map((s) => s.factor), 1),
  );

  peakLabel(hour: number): string {
    const h = Number(hour);
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:00 ${h >= 12 ? 'PM' : 'AM'}`;
  }

  peakLevel(rank: number): { label: string; cls: string } {
    return (
      [
        { label: 'Very High', cls: 'text-red-600 font-bold' },
        { label: 'High', cls: 'text-orange-500 font-semibold' },
        { label: 'Moderate', cls: 'text-amber-500 font-medium' },
      ][rank] ?? { label: 'Moderate', cls: 'text-amber-500 font-medium' }
    );
  }

  growthClass(val: string | null): string {
    return !val ? 'text-gray-400' : +val >= 0 ? 'text-green-600' : 'text-red-500';
  }
  growthPrefix(val: string | null): string {
    return !val ? '' : +val >= 0 ? '+' : '';
  }
}

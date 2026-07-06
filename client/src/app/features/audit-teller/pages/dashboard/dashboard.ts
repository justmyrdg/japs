import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

interface DashboardStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

@Component({
  selector: 'app-audit-teller-dashboard',
  imports: [],
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

  ngOnInit(): void {
    this.loadStats();
  }

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
}

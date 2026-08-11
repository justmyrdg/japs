import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ConfirmModal } from '../../../../shared/components/confirm-modal/confirm-modal';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-audit-teller-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmModal],
  templateUrl: './audit-teller-layout.html',
  styleUrl: './audit-teller-layout.css',
})
export class AuditTellerLayout {
  private auth = inject(AuthService);
  public router = inject(Router);

  user = this.auth.getUser();
  sidebarOpen = signal(true);
  showLogoutConfirm = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'pi-home', route: 'dashboard' },
    { label: 'Remittances', icon: 'pi-file-check', route: 'remittances' },
  ];

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  confirmLogout(): void {
    this.showLogoutConfirm.set(true);
  }

  cancelLogout(): void {
    this.showLogoutConfirm.set(false);
  }

  logout(): void {
    this.showLogoutConfirm.set(false);
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login']),
    });
  }
}

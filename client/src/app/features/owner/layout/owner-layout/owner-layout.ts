import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { AlertService } from '../../../../core/services/alert.service';
import { ConfirmModal } from '../../../../shared/components/confirm-modal/confirm-modal';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-owner-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmModal],
  templateUrl: './owner-layout.html',
  styleUrl: './owner-layout.css',
})
export class OwnerLayout {
  private auth = inject(AuthService);
  private router = inject(Router);
  private alertService = inject(AlertService);

  user = this.auth.getUser();
  sidebarOpen = signal(true);
  showLogoutConfirm = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'pi-chart-bar', route: 'dashboard' },
    { label: 'Remittances', icon: 'pi-book', route: 'remittances' },
    { label: 'Buses', icon: 'pi-car', route: 'buses' },
    { label: 'Routes', icon: 'pi-map', route: 'routes' },
    { label: 'Fare Settings', icon: 'pi-money-bill', route: 'fare-settings' },
    { label: 'Schedules', icon: 'pi-calendar', route: 'schedules' },
    { label: 'Users', icon: 'pi-users', route: 'users' },
  ];

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  roleLabel(): string {
    return this.user?.role === 'secretary' ? 'Secretary' : 'Owner';
  }

  logoutMessage(): string {
    return `You'll need to sign in again to access the ${this.roleLabel()} Portal. Continue?`;
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

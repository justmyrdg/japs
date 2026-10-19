import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ConfirmModal } from '../../../../shared/components/confirm-modal/confirm-modal';
import { NotificationBell } from '../../../../shared/components/notification-bell/notification-bell';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-driver-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmModal, NotificationBell],
  templateUrl: './driver-layout.html',
  styleUrl: './driver-layout.css',
})
export class DriverLayout {
  private auth = inject(AuthService);
  private router = inject(Router);

  user = this.auth.getUser();
  sidebarOpen = signal(true);
  showLogoutConfirm = signal(false);

  navItems: NavItem[] = [
    { label: 'My Schedule', icon: 'pi-calendar', route: 'dashboard' },
    { label: 'My Remittances', icon: 'pi-file-check', route: 'remittances' },
  ];

  /** First letters of the first and last name, for the header avatar. */
  initials(): string {
    const first = this.user?.first_name?.[0] ?? '';
    const last = this.user?.last_name?.[0] ?? '';
    return (first + last).toUpperCase();
  }

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
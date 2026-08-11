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
  selector: 'app-driver-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmModal],
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

import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { AlertService } from '../../../../core/services/alert.service';

interface NavItem {
  label: string;
  shortLabel?: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-conductor-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './conductor-layout.html',
  styleUrl: './conductor-layout.css',
})
export class ConductorLayout {
  private auth = inject(AuthService);
  public router = inject(Router);
  private alertService = inject(AlertService);

  user = this.auth.getUser();
  sidebarOpen = signal(true);
  userMenuOpen = signal(false);

  navItems: NavItem[] = [
    { label: 'My Trips', shortLabel: 'Trips', icon: 'pi-list', route: 'dashboard' },
    { label: 'Ticketing Terminal', shortLabel: 'Ticketing', icon: 'pi-ticket', route: 'ticketing' },
    { label: 'All Tickets', shortLabel: 'Tickets', icon: 'pi-receipt', route: 'tickets' },
    { label: 'Remittances', icon: 'pi-file-check', route: 'remittances' },
  ];

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((v) => !v);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  logout(): void {
    this.closeUserMenu();
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login']),
    });
  }
}

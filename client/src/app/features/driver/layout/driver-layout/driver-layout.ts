import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-driver-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './driver-layout.html',
  styleUrl: './driver-layout.css',
})
export class DriverLayout {
  private auth = inject(AuthService);
  private router = inject(Router);

  user = this.auth.getUser();
  sidebarOpen = signal(true);

  navItems: NavItem[] = [{ label: 'My Schedule', icon: 'pi-calendar', route: 'dashboard' }];

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login']),
    });
  }
}

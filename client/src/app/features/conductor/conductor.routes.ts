import { Routes } from '@angular/router';
import { ConductorLayout } from './layout/conductor-layout/conductor-layout';
import { authGuard } from '../../core/guards/auth.guard';
import { roleGuard } from '../../core/guards/role.guard';

export const CONDUCTOR_ROUTES: Routes = [
  {
    path: '',
    component: ConductorLayout,
    canActivate: [authGuard, roleGuard('conductor')],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard').then((m) => m.ConductorDashboard),
      },
      {
        path: 'ticketing',
        loadComponent: () => import('./pages/ticketing/ticketing').then((m) => m.TicketingPage),
      },
      {
        path: 'tickets',
        loadComponent: () => import('./pages/tickets').then((m) => m.TicketsPage),
      },
      {
        path: 'remittances',
        loadComponent: () =>
          import('./pages/remittances/remittances').then((m) => m.ConductorRemittancesPage),
      },
    ],
  },
];

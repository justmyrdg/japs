import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthUser, LoginResponse } from '../../shared/models/auth.models';

export type { AuthUser, LoginResponse };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = `${environment.apiUrl}/api/auth`;

  constructor(private http: HttpClient) {}

  login(username: string, password: string) {
    return this.http
      .post<LoginResponse>(`${this.API}/login`, { username, password }, { withCredentials: true })
      .pipe(
        tap((res) => {
          // Token is in httpOnly cookie set by the server.
          // Only store non-sensitive profile in localStorage.
          localStorage.setItem('user', JSON.stringify(res.user));
        }),
      );
  }

  logout() {
    return this.http
      .post<void>(`${this.API}/logout`, {}, { withCredentials: true })
      .pipe(tap(() => localStorage.removeItem('user')));
  }

  getUser(): AuthUser | null {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  }

  isLoggedIn(): boolean {
    return !!this.getUser();
  }
}

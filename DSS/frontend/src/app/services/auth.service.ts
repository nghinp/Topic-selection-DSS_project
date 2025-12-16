import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_ENDPOINTS } from '../constants/api';
import { TokenService } from './token.service';

type User = { id: string; email: string; name?: string };
type AuthResponse = { token: string; user: User };

const USER_KEY = 'authUser';
const ADMIN_EMAILS = ['admin@test.com'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private readonly http: HttpClient, private readonly tokens: TokenService) {}

  get token(): string | null {
    return this.tokens.get();
  }

  set token(value: string | null) {
    this.tokens.set(value);
  }

  get user(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  set user(value: User | null) {
    if (value) localStorage.setItem(USER_KEY, JSON.stringify(value));
    else localStorage.removeItem(USER_KEY);
  }

  get displayName(): string {
    return this.user?.name || this.user?.email?.split('@')[0] || 'User';
  }

  isAuthed(): boolean {
    return Boolean(this.token);
  }

  isAdmin(): boolean {
    const email = this.user?.email?.toLowerCase() || '';
    return ADMIN_EMAILS.includes(email);
  }

  register(email: string, password: string, name?: string) {
    return this.http.post<AuthResponse>(`${API_ENDPOINTS.base}/auth/register`, { email, password, name });
  }

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${API_ENDPOINTS.base}/auth/login`, { email, password });
  }

  logout(): void {
    this.token = null;
    this.user = null;
  }

  claimSession(sessionId: string) {
    const base = new HttpHeaders().set('X-Session-Id', sessionId);
    const headers = this.token ? base.set('Authorization', `Bearer ${this.token}`) : base;
    return this.http.post<{ ok: boolean; claimed?: number }>(API_ENDPOINTS.claimSubmissions, {}, { headers });
  }
}

import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly KEY = 'authToken';

  get(): string | null {
    return localStorage.getItem(this.KEY);
  }

  set(value: string | null): void {
    if (value) localStorage.setItem(this.KEY, value);
    else localStorage.removeItem(this.KEY);
  }
}

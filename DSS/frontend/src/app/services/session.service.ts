import { Injectable } from '@angular/core';

const KEY = 'userToken';

@Injectable({ providedIn: 'root' })
export class SessionService {
  getToken(): string {
    let token = localStorage.getItem(KEY);
    if (!token || !this.isUuid(token)) {
      token = this.generateToken();
      localStorage.setItem(KEY, token);
    }
    return token;
  }

  private generateToken(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback UUID v4-like
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value ?? '');
  }
}

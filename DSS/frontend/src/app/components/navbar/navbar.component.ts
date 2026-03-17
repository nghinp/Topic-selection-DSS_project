import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface NavItem {
  label: string;
  active?: boolean;
  path: string;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
  requiresNonAdmin?: boolean;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {
  navItems: NavItem[] = [
    { label: 'Home', path: '/' },
    { label: 'Quiz', path: '/study-field-quiz', requiresNonAdmin: true },
    { label: 'Explore', path: '/explore' },
    { label: 'About', path: '/about' },
  ];

  isDarkMode = false;

  constructor(public readonly auth: AuthService, private readonly router: Router) {
    // Check initial preferences if any
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      this.isDarkMode = savedTheme === 'dark';
      this.applyTheme();
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.isDarkMode = true;
      this.applyTheme();
    }
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.applyTheme();
  }

  private applyTheme(): void {
    if (this.isDarkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }
  }

  submitSearch(term: string): void {
    const q = term.trim();
    if (!q) return;
    this.router.navigate(['/search'], { queryParams: { q } });
  }

  signOut(): void {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}

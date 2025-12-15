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
    { label: 'Quiz', path: '/quiz', requiresNonAdmin: true },
    { label: 'Result', path: '/result/local', requiresNonAdmin: true },
    { label: 'Explore', path: '/explore' },
    { label: 'About', path: '/about' },
  ];

  constructor(public readonly auth: AuthService, private readonly router: Router) {}

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

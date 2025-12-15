import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  error = '';

  constructor(private readonly auth: AuthService, private readonly router: Router, private readonly route: ActivatedRoute) {}

  ngOnInit(): void {
    if (this.auth.isAuthed()) {
      this.router.navigate([this.auth.isAdmin() ? '/admin' : '/account']);
    }
  }

  submit(): void {
    this.error = '';
    if (!this.email || !this.password) {
      this.error = 'Email and password are required.';
      return;
    }

    this.auth.login(this.email, this.password).subscribe({
      next: (res) => {
        this.auth.token = res.token;
        this.auth.user = res.user;
        this.router.navigate([this.auth.isAdmin() ? '/admin' : '/account']);
      },
      error: (err) => {
        this.error = err?.error?.message ?? 'Authentication failed';
      }
    });
  }
}

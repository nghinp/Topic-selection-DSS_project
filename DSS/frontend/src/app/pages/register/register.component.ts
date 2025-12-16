import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { AuthService } from '../../services/auth.service';
import { SessionService } from '../../services/session.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent implements OnInit {
  email = '';
  password = '';
  name = '';
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly session: SessionService
  ) {}

  ngOnInit(): void {
    if (this.auth.isAuthed()) {
      this.router.navigate(['/account']);
    }
  }

  submit(): void {
    this.error = '';
    if (!this.email || !this.password) {
      this.error = 'Email and password are required.';
      return;
    }
    this.auth.register(this.email, this.password, this.name).subscribe({
      next: (res) => {
        this.auth.token = res.token;
        this.auth.user = res.user;
        this.auth.claimSession(this.session.getToken()).subscribe({
          next: () => this.router.navigate(['/account']),
          error: () => this.router.navigate(['/account'])
        });
      },
      error: (err) => {
        this.error = err?.error?.message ?? 'Registration failed';
      }
    });
  }
}

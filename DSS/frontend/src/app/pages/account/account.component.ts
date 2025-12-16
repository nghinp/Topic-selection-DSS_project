import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { API_ENDPOINTS } from '../../constants/api';
import { AuthService } from '../../services/auth.service';
import { FormsModule } from '@angular/forms';

type SavedTopic = { id: string; topic: string; label?: string; createdAt?: string };
type Submission = {
  id: string;
  thesisType: string;
  scores: Record<string, number>;
  topAreas: string[];
  durationMs?: number;
  createdAt?: string;
};

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, NavbarComponent],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss'
})
export class AccountComponent implements OnInit {
  savedTopics: SavedTopic[] = [];
  submissions: Submission[] = [];
  loading = true;
  error = '';

  constructor(private readonly http: HttpClient, private readonly router: Router, public readonly auth: AuthService) {}

  ngOnInit(): void {
    if (!this.auth.isAuthed()) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';
    Promise.all([this.fetchTopics(), this.fetchSubmissions()])
      .then(() => (this.loading = false))
      .catch(() => {
        this.error = 'Could not load account data.';
        this.loading = false;
      });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  private async fetchTopics(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.get<SavedTopic[]>(API_ENDPOINTS.savedTopics, { headers: this.authHeaders }).subscribe({
        next: (rows) => {
          this.savedTopics = rows;
          resolve();
        },
        error: reject
      });
    });
  }

  private async fetchSubmissions(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.get<Submission[]>(API_ENDPOINTS.submissions, { headers: this.authHeaders }).subscribe({
        next: (rows) => {
          this.submissions = rows;
          resolve();
        },
        error: reject
      });
    });
  }

  private get authHeaders(): HttpHeaders {
    const token = this.auth.token || localStorage.getItem('authToken');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}

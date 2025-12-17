import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { TopicRecord, TopicSearchResult, TopicsService } from '../../services/topics.service';
import { AuthService } from '../../services/auth.service';
import { API_ENDPOINTS } from '../../constants/api';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, NavbarComponent, RouterModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  protected keyword = '';
  protected searching = false;
  protected searchError = '';
  protected hasSearched = false;
  protected results: TopicSearchResult[] = [];
  protected featured: TopicRecord[] = [];
  protected savedTopics: Array<{ id: string; topic: string; label?: string }> = [];
  protected stats = { topics: 0, areas: 0, saved: 0 };
  protected loadingFeatured = false;
  protected savedLoading = false;
  protected savedError = '';

  constructor(
    private readonly topics: TopicsService,
    private readonly router: Router,
    private readonly http: HttpClient,
    public readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    this.loadFeatured();
    if (this.auth.isAuthed()) {
      this.loadSavedTopics();
    }
  }

  protected search(): void {
    this.searchError = '';
    const query = this.keyword.trim();
    if (!query) {
      this.searchError = 'Enter a keyword to search topics.';
      this.results = [];
      this.hasSearched = false;
      return;
    }

    this.searching = true;
    this.hasSearched = true;
    this.router.navigate(['/search'], { queryParams: { q: query } });
  }

  protected openTopic(id: string): void {
    this.router.navigate(['/topics', id]);
  }

  private loadFeatured(): void {
    this.loadingFeatured = true;
    this.topics.listAll().subscribe({
      next: (rows) => {
        this.stats.topics = rows.length;
        const areas = new Set(rows.map((t) => t.area));
        this.stats.areas = areas.size;
        this.featured = rows.slice(0, 10);
        this.loadingFeatured = false;
      },
      error: () => {
        this.loadingFeatured = false;
      }
    });
  }

  private loadSavedTopics(): void {
    this.savedLoading = true;
    this.savedError = '';
    this.http
      .get<Array<{ id: string; topic: string; label?: string }>>(API_ENDPOINTS.savedTopics, { headers: this.authHeaders })
      .subscribe({
        next: (rows) => {
          this.savedTopics = rows.slice(0, 5);
          this.stats.saved = rows.length;
          this.savedLoading = false;
        },
        error: () => {
          this.savedError = 'Could not load saved topics.';
          this.savedLoading = false;
        }
      });
  }

  private get authHeaders(): HttpHeaders {
    const token = this.auth.token || localStorage.getItem('authToken');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}

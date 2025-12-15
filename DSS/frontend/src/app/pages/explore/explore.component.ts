import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { API_ENDPOINTS } from '../../constants/api';
import { AuthService } from '../../services/auth.service';
import { TopicsService, TopicRecord } from '../../services/topics.service';
import { AREA_LABELS } from '../../constants/areas';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, HttpClientModule, NavbarComponent],
  templateUrl: './explore.component.html',
  styleUrl: './explore.component.scss'
})
export class ExploreComponent implements OnInit {
  protected topics: TopicRecord[] = [];
  protected savedTopics: string[] = [];
  protected saveMessage = '';
  protected showAuthModal = false;
  protected loading = false;
  protected loadError = '';
  protected selectedArea = 'ALL';
  protected areaOptions: string[] = [];

  protected labelFor(area: string): string {
    return AREA_LABELS[area] || area;
  }

  constructor(
    private readonly http: HttpClient,
    private readonly topicsService: TopicsService,
    public readonly auth: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.fetchTopics();
    this.loadSavedTopics();
  }

  protected save(topic: TopicRecord): void {
    const key = `${topic.area}:${topic.title}`.toLowerCase();
    if (this.savedTopics.includes(key)) {
      this.saveMessage = 'Topic already saved.';
      return;
    }
    if (!this.auth.isAuthed()) {
      this.showAuthModal = true;
      return;
    }
    this.http
      .post<{ id: string }>(
        API_ENDPOINTS.savedTopics,
        { topic: topic.title, label: topic.area },
        { headers: this.authHeaders }
      )
      .subscribe({
        next: () => {
          this.savedTopics = [key, ...this.savedTopics];
          this.saveMessage = 'Saved!';
        },
        error: () => {
          this.saveMessage = 'Could not save topic.';
        }
      });
  }

  protected closeAuthModal(): void {
    this.showAuthModal = false;
  }

  protected goToLogin(): void {
    this.showAuthModal = false;
    this.router.navigate(['/login']);
  }

  protected goToRegister(): void {
    this.showAuthModal = false;
    this.router.navigate(['/register']);
  }

  private fetchTopics(): void {
    this.loading = true;
    this.loadError = '';
    this.topicsService.listAll().subscribe({
      next: (rows) => {
        this.topics = rows;
        this.setAreaOptions(rows);
        this.loading = false;
      },
      error: () => {
        this.loadError = 'Could not load topics from server.';
        this.loading = false;
      }
    });
  }

  protected filteredTopics(): TopicRecord[] {
    if (!this.topics.length) return [];
    if (this.selectedArea === 'ALL') return this.topics;
    return this.topics.filter((t) => t.area === this.selectedArea);
  }

  protected selectArea(area: string): void {
    this.selectedArea = area;
  }

  private loadSavedTopics(): void {
    if (!this.auth.isAuthed()) return;
    this.http
      .get<Array<{ topic: string; label?: string }>>(API_ENDPOINTS.savedTopics, { headers: this.authHeaders })
      .subscribe({
        next: (rows) => {
          this.savedTopics = rows.map(
            (t) => `${(t.label || '').toUpperCase()}:${t.topic}`.toLowerCase()
          );
        },
      });
  }

  private get authHeaders(): HttpHeaders {
    const token = this.auth.token || localStorage.getItem('authToken');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private setAreaOptions(rows: TopicRecord[]): void {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.area));
    this.areaOptions = ['ALL', ...Array.from(set).sort()];
  }
}

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
  protected searchTerm = '';
  protected interestOptions: string[] = [
    'Art & Literature',
    'Astronomy',
    'Biology',
    'Business & Economics',
    'Chemistry',
    'Education & Learning',
    'Engineering & Technology',
    'Entrepreneurship & Innovation',
    'Finance & Accounting',
    'History',
    'IT & Computer Science',
    'Law',
    'Management & Leadership',
    'Marketing, Communication & Media',
    'Mathematics & Statistics',
    'Medicine & Health',
    'Philosophy & Ethics',
    'Political Science',
    'Psychology',
    'Religion & Theology',
    'Sociology',
    'Sustainability & Environment',
    'Tax',
    'Tourism & Hospitality'
  ];
  protected selectedInterests = new Set<string>();

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
    const key = this.keyFor(topic);
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
        { topic: topic.id || topic.title, label: topic.title },
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
    let list = this.topics;
    if (this.selectedArea !== 'ALL') {
      list = list.filter((t) => t.area === this.selectedArea);
    }
    const term = this.searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter((t) => {
        const title = (t.title || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        return title.includes(term) || desc.includes(term);
      });
    }
    if (this.selectedInterests.size) {
      const needles = Array.from(this.selectedInterests).map((s) => s.toLowerCase());
      list = list.filter((t) => {
        const hay = `${t.title || ''} ${t.description || ''} ${this.labelFor(t.area)}`.toLowerCase();
        return needles.some((n) => hay.includes(n));
      });
    }
    return list;
  }

  protected selectArea(area: string): void {
    this.selectedArea = area;
  }

  protected toggleInterest(value: string, checked: boolean): void {
    if (checked) {
      this.selectedInterests.add(value);
    } else {
      this.selectedInterests.delete(value);
    }
  }

  protected isInterestSelected(value: string): boolean {
    return this.selectedInterests.has(value);
  }

  protected isSaved(topic: TopicRecord): boolean {
    return this.savedTopics.includes(this.keyFor(topic));
  }

  private loadSavedTopics(): void {
    if (!this.auth.isAuthed()) return;
    this.http
      .get<Array<{ topic: string; label?: string }>>(API_ENDPOINTS.savedTopics, { headers: this.authHeaders })
      .subscribe({
        next: (rows) => {
          const keys = rows.map((t) => this.normalizeKey(t.topic));
          this.savedTopics = Array.from(new Set(keys));
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
    if (!this.areaOptions.includes(this.selectedArea)) {
      this.selectedArea = 'ALL';
    }
  }

  private keyFor(topic: TopicRecord): string {
    return this.normalizeKey(topic.id || topic.title);
  }

  private normalizeKey(value: string): string {
    return (value || '').trim().toLowerCase();
  }

  protected cleanDescription(value?: string | null): string {
    if (!value) return '';
    return value
      .replace(/!\[[^\]]*]\([^)]*\)/g, '')
      .replace(/data:image\/[^)\s]+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

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
import { INTEREST_OPTIONS } from '../../constants/interests';

type ExploreTopicRecord = TopicRecord & {
  interests?: string[];
  short_description?: string | null;
};

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, HttpClientModule, NavbarComponent],
  templateUrl: './explore.component.html',
  styleUrl: './explore.component.scss'
})
export class ExploreComponent implements OnInit {
  protected topics: ExploreTopicRecord[] = [];
  protected savedTopics: string[] = [];
  protected saveMessage = '';
  protected showAuthModal = false;
  protected loading = false;
  protected loadError = '';
  protected selectedArea = 'ALL';
  protected areaOptions: string[] = [];
  protected searchTerm = '';
  protected interestOptions = INTEREST_OPTIONS;
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

  protected save(topic: ExploreTopicRecord): void {
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

  protected filteredTopics(): ExploreTopicRecord[] {
    if (!this.topics.length) return [];
    let list = this.topics;
    if (this.selectedArea !== 'ALL') {
      list = list.filter((t) => t.area === this.selectedArea);
    }
    const term = this.searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter((t) => {
        const title = (t.title || '').toLowerCase();
        const shortDescription = (t.shortDescription || t.short_description || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const interests = (t.interests || []).join(' ').toLowerCase();
        return title.includes(term) || shortDescription.includes(term) || desc.includes(term) || interests.includes(term);
      });
    }
    if (this.selectedInterests.size) {
      list = list.filter((t) => {
        const topicInterests = t.interests ?? [];
        return topicInterests.some((interest) => this.selectedInterests.has(interest));
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

  protected isSaved(topic: ExploreTopicRecord): boolean {
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

  private setAreaOptions(rows: ExploreTopicRecord[]): void {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.area));
    this.areaOptions = ['ALL', ...Array.from(set).sort()];
    if (!this.areaOptions.includes(this.selectedArea)) {
      this.selectedArea = 'ALL';
    }
  }

  private keyFor(topic: ExploreTopicRecord): string {
    return this.normalizeKey(topic.id || topic.title);
  }

  protected topicInterests(topic: ExploreTopicRecord): string[] {
    return topic.interests ?? [];
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

  protected summaryText(topic: ExploreTopicRecord): string {
    return this.cleanDescription(topic.shortDescription || topic.short_description || topic.description);
  }
}

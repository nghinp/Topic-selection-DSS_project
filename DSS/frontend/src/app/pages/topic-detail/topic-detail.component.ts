import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { TopicsService, TopicRecord } from '../../services/topics.service';
import { AREA_LABELS } from '../../constants/areas';
import { API_ENDPOINTS } from '../../constants/api';
import { AuthService } from '../../services/auth.service';
import { EMPTY_TOPIC_DETAIL_CONTENT, TopicDetailContent } from '../../types/topic-detail-content';

@Component({
  selector: 'app-topic-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent, HttpClientModule],
  templateUrl: './topic-detail.component.html',
  styleUrls: ['./topic-detail.component.scss']
})
export class TopicDetailComponent implements OnInit {
  protected topic: TopicRecord | null = null;
  protected loading = false;
  protected error = '';
  protected descriptionClean = '';
  protected saving = false;
  protected saveError = '';
  protected saveSuccess = '';
  protected showLoginPrompt = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly topics: TopicsService,
    private readonly router: Router,
    private readonly http: HttpClient,
    public readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) {
        this.error = 'Topic not found.';
        return;
      }
      this.fetchTopic(id);
    });
  }

  protected areaLabel(area: string): string {
    return AREA_LABELS[area] || area;
  }

  protected back(): void {
    this.router.navigate(['/explore']);
  }

  protected saveTopic(): void {
    if (!this.topic) return;
    if (!this.auth.isAuthed()) {
      this.showLoginPrompt = true;
      return;
    }
    this.saving = true;
    this.saveError = '';
    this.saveSuccess = '';
    this.http
      .post<{ id: string; topic: string; label?: string }>(
        API_ENDPOINTS.savedTopics,
        { topic: this.topic.id || this.topic.title, label: this.topic.title },
        { headers: this.authHeaders }
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.saveSuccess = 'Topic saved.';
        },
        error: () => {
          this.saving = false;
          this.saveError = 'Could not save topic.';
        }
      });
  }

  protected closeLoginPrompt(): void {
    this.showLoginPrompt = false;
  }

  protected detailContent(): TopicDetailContent {
    return this.topic?.detailContent ?? EMPTY_TOPIC_DETAIL_CONTENT;
  }

  private fetchTopic(id: string): void {
    this.loading = true;
    this.error = '';
    this.topic = null;
    this.topics.getById(id).subscribe({
      next: (t) => {
        this.topic = t;
        this.descriptionClean = this.cleanDescription(t.description);
        this.loading = false;
      },
      error: () => {
        this.error = 'Could not load topic.';
        this.loading = false;
      }
    });
  }

  private cleanDescription(desc?: string | null): string {
    if (!desc) return '';
    return desc
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private get authHeaders(): HttpHeaders {
    const token = this.auth.token || localStorage.getItem('authToken');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}

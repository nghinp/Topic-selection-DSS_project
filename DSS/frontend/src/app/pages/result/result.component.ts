import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { API_ENDPOINTS, ApiSubmissionResponse } from '../../constants/api';
import { AREA_LABELS } from '../../constants/areas';
import { TopicsService, TopicRecord } from '../../services/topics.service';
import { AuthService } from '../../services/auth.service';

export type AreaCode = 'AI' | 'DATA' | 'SEC' | 'WEB' | 'MOBILE' | 'CLOUD' | 'NET' | 'IOT' | 'WEB3' | 'UX' | 'PM';
type ThesisType = 'Research' | 'Practical Application';
type Recommendation = {
  thesisType: ThesisType;
  scores: Record<AreaCode, number>;
  topAreas: AreaCode[];
};

@Component({
  selector: 'app-result',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HttpClientModule, NavbarComponent],
  templateUrl: './result.component.html',
  styleUrl: './result.component.scss'
})
export class ResultComponent implements OnInit {
  protected rec: Recommendation | null = null;
  protected answered = 0;
  protected total = 0;
  protected thesisType: ThesisType | '' = '';
  protected loading = true;
  protected errorMessage = '';
  protected savedTopics: Array<{ id: string; topic: string; label?: string }> = [];
  protected saveMessage = '';
  protected authMode: 'login' | 'register' = 'login';
  protected authEmail = '';
  protected authPassword = '';
  protected authName = '';
  protected authError = '';
  protected showAuthModal = false;
  protected savedResults: Array<{ id: string; thesisType: string; topAreas: string[]; createdAt?: string }> = [];
  protected savedLoading = false;
  protected savedError = '';
  protected allTopicsByArea: Record<string, TopicRecord[]> = {};

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    public readonly auth: AuthService,
    private readonly router: Router,
    private readonly topicsService: TopicsService
  ) {}

  ngOnInit(): void {
    if (this.auth.isAuthed()) {
      this.fetchSavedResults();
    }
    this.fetchAllTopics();
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      this.resetResultState();
      if (!id || id === 'local') {
        this.useNavigationState();
        return;
      }
      this.fetchResult(id);
      this.loadSavedTopics();
    });
  }

  protected get traitList(): Array<{ code: AreaCode; score: number }> {
    return this.rec
      ? Object.entries(this.rec.scores).map(([code, score]) => ({ code: code as AreaCode, score }))
      : [];
  }

  private fetchResult(id: string): void {
    this.loading = true;
    this.http.get<ApiSubmissionResponse>(`${API_ENDPOINTS.submissions}/${id}`).subscribe({
      next: (res) => {
        const recPayload = (res as any).recommendation ?? res;
        this.rec = {
          thesisType: recPayload.thesisType ?? 'Research',
          scores: recPayload.scores ?? {},
          topAreas: recPayload.topAreas ?? []
        };
        this.thesisType = this.rec.thesisType;
        this.answered = (res as any).answered ?? (res as any).total ?? 0;
        this.total = (res as any).total ?? 0;
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Could not load result from API.';
        this.useNavigationState();
      }
    });
  }

  private resetResultState(): void {
    this.rec = null;
    this.thesisType = '';
    this.answered = 0;
    this.total = 0;
    this.errorMessage = '';
    this.loading = true;
  }

  private useNavigationState(): void {
    const state = history.state as { rec?: Recommendation; answered?: number; total?: number };
    if (state?.rec) {
      this.rec = state.rec;
      this.thesisType = state.rec.thesisType;
      this.answered = state.answered ?? 0;
      this.total = state.total ?? 0;
    } else {
      this.errorMessage = 'No result available. Please retake the quiz.';
    }
    this.loading = false;
  }

  protected topicsFor(area: AreaCode): TopicRecord[] {
    return this.allTopicsByArea[area] ?? [];
  }

  protected areaLabel(area: AreaCode | string): string {
    return AREA_LABELS[area as AreaCode] || area;
  }

  protected saveTopic(topic: string, label?: string): void {
    // Prevent duplicates (case-insensitive compare on topic + label)
    const already = this.savedTopics.some(
      (t) => t.topic.toLowerCase() === topic.toLowerCase() && (t.label ?? '').toLowerCase() === (label ?? '').toLowerCase()
    );
    if (already) {
      this.saveMessage = 'Topic has already been saved.';
      return;
    }

    if (!this.auth.isAuthed()) {
      this.showAuthModal = true;
      return;
    }
    this.http.post<{ id: string; topic: string }>(API_ENDPOINTS.savedTopics, { topic, label }, { headers: this.authHeaders }).subscribe({
      next: (res) => {
        this.savedTopics = [{ id: res.id, topic: res.topic, label }, ...this.savedTopics];
        this.saveMessage = 'Saved!';
      },
      error: () => {
        this.saveMessage = 'Could not save topic.';
      }
    });
  }

  protected loadSavedTopics(): void {
    if (!this.auth.isAuthed()) return;
    this.http
      .get<Array<{ id: string; topic: string; label?: string }>>(API_ENDPOINTS.savedTopics, { headers: this.authHeaders })
      .subscribe({
        next: (rows) => {
          this.savedTopics = rows;
        },
        error: () => {
          // silent
        }
      });
  }

  protected submitAuth(): void {
    this.authError = '';
    if (!this.authEmail || !this.authPassword) {
      this.authError = 'Email and password are required.';
      return;
    }

    const next$ =
      this.authMode === 'login'
        ? this.auth.login(this.authEmail, this.authPassword)
        : this.auth.register(this.authEmail, this.authPassword, this.authName);

    next$.subscribe({
      next: (res) => {
        this.auth.token = res.token;
        this.auth.user = res.user;
        this.saveMessage = 'Signed in. You can save topics now.';
        this.loadSavedTopics();
      },
      error: (err) => {
        this.authError = err?.error?.message ?? 'Auth failed';
      }
    });
  }

  private fetchSavedResults(): void {
    this.savedLoading = true;
    this.savedError = '';
    this.http
      .get<Array<{ id: string; thesisType: string; topAreas: string[]; createdAt?: string }>>(API_ENDPOINTS.submissions, {
        headers: this.authHeaders
      })
      .subscribe({
        next: (rows) => {
          this.savedResults = rows;
          this.savedLoading = false;
        },
        error: () => {
          this.savedError = 'Could not load saved results.';
          this.savedLoading = false;
        }
      });
  }

  private fetchAllTopics(): void {
    this.topicsService.listAll().subscribe({
      next: (rows) => {
        this.allTopicsByArea = rows.reduce((acc, topic) => {
          const areaKey = topic.area;
          acc[areaKey] = acc[areaKey] || [];
          acc[areaKey].push(topic);
          return acc;
        }, {} as Record<string, TopicRecord[]>);
      },
      error: () => {
        // keep empty, fallback handled by optional chaining
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

  private get authHeaders(): HttpHeaders {
    const token = this.auth.token || localStorage.getItem('authToken');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}

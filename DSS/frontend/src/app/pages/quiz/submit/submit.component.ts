import { CommonModule, Location } from '@angular/common';
import { Component } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../../components/navbar/navbar.component';
import { ThesisWizardService } from '../../../services/thesis-wizard.service';
import { API_ENDPOINTS } from '../../../constants/api';
import { AuthService } from '../../../services/auth.service';

type RecommendationRequest = {
  userId: string | null;
  major: 'IT' | 'CS' | 'DS';
  thesisPreference: 'Research' | 'Practical' | 'Not defined';
  includeKeywords: string;
  excludeKeywords: string;
  careerAim: string;
  interests: string;
};

type RecommendationResponse = {
  recommendationId: string;
  intentId: string;
  bestTopic: {
    topic_id: string;
    title: string;
    description: string | null;
    area: string;
    thesis_type: string | null;
  };
  scores: {
    finalScore: number;
    topicRank: number;
    topicRankNorm: number;
    coverage: number | null;
  };
};

@Component({
  selector: 'app-submit',
  standalone: true,
  imports: [CommonModule, RouterModule, HttpClientModule, NavbarComponent],
  templateUrl: './submit.component.html',
  styleUrl: './submit.component.scss'
})
export class SubmitComponent {
  protected loading = false;
  protected errorMessage = '';
  protected result: RecommendationResponse | null = null;

  constructor(
    private readonly location: Location,
    private readonly http: HttpClient,
    private readonly wizard: ThesisWizardService,
    private readonly auth: AuthService
  ) {}

  onBack() {
    this.location.back();
  }

  protected onSubmit() {
    if (!this.wizard.state.major || !this.wizard.state.direction) {
      this.errorMessage = 'Please complete all previous quiz steps first.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.result = null;

    const authUserId = this.auth.user?.id ?? null;
    const payload: RecommendationRequest = {
      userId: this.isUuid(authUserId) ? authUserId : null,
      major: this.wizard.state.major,
      thesisPreference: this.toThesisPreference(),
      includeKeywords: this.wizard.state.initialIdeas.trim(),
      excludeKeywords: this.wizard.state.excludeTopics.trim(),
      careerAim: this.wizard.state.careerGoal.trim(),
      interests: this.wizard.state.interests.trim()
    };

    this.http.post<RecommendationResponse>(API_ENDPOINTS.recommendation, payload).subscribe({
      next: (res) => {
        this.result = res;
        this.loading = false;
      },
      error: (err) => {
        this.errorMessage = err?.error?.message || 'Could not generate recommendation.';
        this.loading = false;
      }
    });
  }

  private toThesisPreference(): RecommendationRequest['thesisPreference'] {
    if (this.wizard.state.direction === 'research') return 'Research';
    if (this.wizard.state.direction === 'practical') return 'Practical';
    return 'Not defined';
  }

  private isUuid(value: string | null): boolean {
    if (!value) return false;
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value);
  }
}

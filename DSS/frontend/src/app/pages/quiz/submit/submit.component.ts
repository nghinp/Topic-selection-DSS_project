import { CommonModule, Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../../components/navbar/navbar.component';
import { RecommendationResult, ThesisWizardService } from '../../../services/thesis-wizard.service';
import { API_ENDPOINTS } from '../../../constants/api';
import { AuthService } from '../../../services/auth.service';
import { InterestOption } from '../../../constants/interests';

type RecommendationRequest = {
  userId: string | null;
  major: 'IT' | 'CS' | 'DS';
  thesisPreference: 'Research' | 'Practical' | 'Not defined';
  includeKeywords: string;
  excludeKeywords: string;
  careerAim: string;
  selectedInterests: InterestOption[];
};

@Component({
  selector: 'app-submit',
  standalone: true,
  imports: [CommonModule, RouterModule, HttpClientModule, NavbarComponent],
  templateUrl: './submit.component.html',
  styleUrl: './submit.component.scss'
})
export class SubmitComponent implements OnInit {
  protected loading = false;
  protected errorMessage = '';
  protected result: RecommendationResult | null = null;

  constructor(
    private readonly location: Location,
    private readonly http: HttpClient,
    private readonly wizard: ThesisWizardService,
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit() {
    this.result = this.wizard.lastRecommendation;
  }

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
      selectedInterests: this.wizard.state.selectedInterests
    };

    this.http.post<RecommendationResult>(API_ENDPOINTS.recommendation, payload).subscribe({
      next: (res) => {
        this.result = res;
        this.wizard.setLastRecommendation(res);
        this.loading = false;
      },
      error: (err) => {
        this.errorMessage = err?.error?.message || 'Could not generate recommendation.';
        this.loading = false;
      }
    });
  }

  startOver() {
    this.wizard.reset();
    this.result = null;
    this.router.navigate(['/study-field-quiz']);
  }

  bestTopicInterests(): string[] {
    return this.result?.bestTopic?.interests ?? [];
  }

  bestTopicSummary(): string | null {
    const bestTopic = this.result?.bestTopic;
    if (!bestTopic) return null;
    return bestTopic.shortDescription || bestTopic.short_description || bestTopic.description || null;
  }

  matchingFactors(): Array<{ label: string; score: number }> {
    if (!this.result?.bestTopic) return [];

    const hasCareerGoal = Boolean(this.wizard.state.careerGoal.trim());
    const careerAlignmentBase = Math.round((this.result.scores.topicRankNorm || 0) * 100);
    const careerAlignment = hasCareerGoal
      ? Math.max(55, Math.min(100, careerAlignmentBase))
      : Math.max(40, Math.min(85, careerAlignmentBase));
    const interestRelevance =
      this.result.scores.interestMatchScore === null
        ? this.bestTopicInterests().length ? 70 : 0
        : Math.round(this.result.scores.interestMatchScore * 100);
    const keywordRelevance = this.result.scores.coverage === null
      ? Math.round((this.result.scores.topicRankNorm || 0) * 100)
      : Math.round(this.result.scores.coverage * 100);

    return [
      { label: 'Major match', score: 100 },
      { label: 'Career alignment', score: careerAlignment },
      { label: 'Interest relevance', score: interestRelevance },
      { label: 'Keyword relevance', score: keywordRelevance }
    ];
  }

  progressStyle(score: number): string {
    return `${Math.max(0, Math.min(100, score))}%`;
  }

  progressText(score: number): string {
    if (score >= 85) return `${score}% strong match`;
    if (score >= 65) return `${score}% good match`;
    if (score >= 40) return `${score}% partial match`;
    return `${score}% low match`;
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

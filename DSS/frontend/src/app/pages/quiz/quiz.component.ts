import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import choices, { ChoiceOption } from '../../data/choices';
import questions, { Question } from '../../data/questions';
import { API_ENDPOINTS, ApiSubmissionResponse } from '../../constants/api';

type AreaCode = 'AI' | 'DATA' | 'SEC' | 'WEB' | 'MOBILE' | 'CLOUD' | 'NET' | 'IOT' | 'WEB3' | 'UX' | 'PM';
type ThesisType = 'Research' | 'Practical Application';
type Recommendation = {
  thesisType: ThesisType;
  scores: Record<AreaCode, number>;
  topAreas: AreaCode[];
};

@Component({
  selector: 'app-quiz',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HttpClientModule, NavbarComponent],
  templateUrl: './quiz.component.html',
  styleUrl: './quiz.component.scss'
})
export class QuizComponent implements OnInit, OnDestroy {
  protected questions: Question[] = [];
  protected currentIndex = 0;
  protected answers: Record<string, number> = {};
  protected readonly totalSeconds = 60 * 60; // 60 minutes
  protected timeLeft = this.totalSeconds;
  protected quizFinished = false;
  protected quizStarted = false;
  protected showTimeoutModal = false;
  protected submissionId?: string;
  protected rec?: Recommendation;
  protected loading = false;
  protected errorMessage = '';
  private timerId?: number;

  constructor(private readonly http: HttpClient, private readonly router: Router) {}

  ngOnInit(): void {
    this.fetchQuestions();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  protected get currentQuestion(): Question {
    return this.questions[this.currentIndex];
  }

  protected get optionsForCurrent(): ChoiceOption[] {
    return choices[this.currentQuestion?.keyed ?? 'plus'];
  }

  protected get progressPercent(): number {
    if (!this.questions.length) {
      return 0;
    }
    return Math.round(((this.currentIndex + 1) / this.questions.length) * 100);
  }

  protected get answeredCount(): number {
    return Object.keys(this.answers).length;
  }

  protected get formattedTime(): string {
    const minutes = Math.floor(this.timeLeft / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (this.timeLeft % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  protected selectAnswer(value: number): void {
    if (!this.currentQuestion) {
      return;
    }
    if (!this.quizStarted) {
      this.quizStarted = true;
      this.startTimer();
    }
    this.answers[this.currentQuestion.id] = value;
  }

  protected canProceed(): boolean {
    return Boolean(this.currentQuestion && this.answers[this.currentQuestion.id]);
  }

  protected next(): void {
    if (!this.canProceed()) {
      return;
    }
    if (this.currentIndex < this.questions.length - 1) {
      this.currentIndex += 1;
      return;
    }
    this.finishQuiz();
  }

  protected prev(): void {
    if (this.currentIndex === 0) {
      return;
    }
    this.currentIndex -= 1;
  }

  protected finishQuiz(force = false): void {
    if (this.quizFinished) {
      return;
    }
    if (!force && this.answeredCount === 0) {
      this.errorMessage = 'Please answer at least one question before submitting.';
      return;
    }
    this.quizFinished = true;
    this.stopTimer();
    this.submitResults();
  }

  protected restart(): void {
    this.answers = {};
    this.currentIndex = 0;
    this.quizFinished = false;
    this.quizStarted = false;
    this.timeLeft = this.totalSeconds;
    this.submissionId = undefined;
    this.rec = undefined;
    this.errorMessage = '';
    this.showTimeoutModal = false;
    this.stopTimer();
    this.startTimer();
  }

  protected goToResult(): void {
    if (!this.submissionId) {
      return;
    }
    this.router.navigate(['/result', this.submissionId], {
      state: {
        rec: this.rec,
        answered: this.answeredCount,
        total: this.questions.length
      }
    });
  }

  private fetchQuestions(): void {
    this.loading = true;
    this.http.get<{ questions: Question[] }>(API_ENDPOINTS.questions).subscribe({
      next: (payload) => {
        this.questions = payload.questions;
        this.loading = false;
      },
      error: () => {
        // fallback to local bundle
        this.questions = questions;
        this.loading = false;
        this.errorMessage = 'Using offline question set (API unavailable).';
      }
    });
  }

  private submitResults(): void {
    if (!this.questions.length) {
      return;
    }
    const recommendation = this.computeRecommendation(this.answers, this.questions);
    this.rec = recommendation;
    const body = {
      answers: this.answers,
      durationMs: (this.totalSeconds - this.timeLeft) * 1000,
      recommendation
    };

    this.http.post<ApiSubmissionResponse>(API_ENDPOINTS.submissions, body, { headers: this.authHeaders }).subscribe({
      next: (res) => {
        this.submissionId = res.id;
        this.rec = {
          thesisType: (res as any).thesisType ?? recommendation.thesisType,
          scores: (res as any).scores ?? recommendation.scores,
          topAreas: (res as any).topAreas ?? recommendation.topAreas
        };
      },
      error: (err) => {
        // keep local summary when API fails
        this.submissionId = 'local';
        if (err?.status === 401) {
          this.errorMessage = 'Please login/register to save your result online.';
        }
      }
    });
  }

  private get authHeaders(): HttpHeaders {
    const token = localStorage.getItem('authToken');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private computeRecommendation(answers: Record<string, number>, qs: Question[]): Recommendation {
    const get = (id: string) => answers[id] ?? 0;

    // Section A
    const researchScore = (get('q01') + get('q02') + get('q05')) / 3;
    const appScore = (get('q03') + get('q04') + get('q06')) / 3;
    const thesisType: ThesisType = researchScore >= appScore ? 'Research' : 'Practical Application';

    // Section B working style
    const independent = get('q07') + get('q12');
    const teamwork = get('q08');
    const structured = get('q09') + get('q14');
    const flexible = get('q10') + get('q13');

    const workingFit: Record<AreaCode, number> = {
      AI: (independent + flexible / 2) / 10,
      DATA: (independent + flexible / 2) / 10,
      SEC: (independent + structured) / 10,
      CLOUD: (structured + teamwork / 2) / 10,
      NET: (structured + teamwork / 2) / 10,
      WEB: (teamwork + flexible) / 10,
      MOBILE: (teamwork + flexible) / 10,
      UX: (teamwork + flexible) / 10,
      WEB3: (flexible + independent / 2) / 10,
      IOT: (structured + independent) / 10,
      PM: (structured + teamwork) / 10
    };

    // Section C interest base
    const base: Record<AreaCode, number> = {
      AI: get('q15'),
      DATA: get('q16'),
      SEC: get('q17'),
      WEB: get('q18'),
      MOBILE: get('q19'),
      CLOUD: get('q20'),
      NET: get('q21'),
      IOT: get('q22'),
      WEB3: get('q23'),
      UX: get('q24'),
      PM: get('q25')
    };

    // Section D skills
    const ability: Record<AreaCode, number> = {
      AI: (get('q26') + get('q12')) / 10,
      DATA: (get('q26') + get('q12')) / 10,
      SEC: get('q29') / 5,
      CLOUD: get('q27') / 5,
      NET: get('q29') / 5,
      WEB: (get('q27') + get('q28')) / 10,
      MOBILE: (get('q27') + get('q28')) / 10,
      UX: get('q30') / 5,
      WEB3: get('q28') / 5,
      IOT: (get('q27') + get('q29')) / 10,
      PM: get('q30') / 5
    };

    const finalScores = {} as Record<AreaCode, number>;
    (Object.keys(base) as AreaCode[]).forEach((area) => {
      const interest = base[area] / 5;
      const work = workingFit[area];
      const boost = ability[area];
      const adjustedInterest = interest * (1 + boost * 0.5);
      finalScores[area] = Math.round((adjustedInterest * 0.7 + work * 0.2 + boost * 0.1) * 100);
    });

    const topAreas = (Object.entries(finalScores) as [AreaCode, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([area]) => area);

    return { thesisType, scores: finalScores, topAreas };
  }

  private startTimer(): void {
    if (this.timerId) {
      return;
    }
    this.timerId = window.setInterval(() => {
      if (this.timeLeft > 0) {
        this.timeLeft--;
        return;
      }
      this.handleTimeout();
    }, 1000);
  }

  private stopTimer(): void {
    if (!this.timerId) {
      return;
    }
    window.clearInterval(this.timerId);
    this.timerId = undefined;
  }

  private handleTimeout(): void {
    this.stopTimer();
    this.showTimeoutModal = true;
    this.finishQuiz(true);
  }
}

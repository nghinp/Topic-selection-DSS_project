import { Injectable } from '@angular/core';
import { InterestOption } from '../constants/interests';

export type WizardMajor = 'IT' | 'CS' | 'DS';
export type WizardDirection = 'research' | 'practical';
const QUIZ_RESULT_STORAGE_KEY = 'thesisQuiz:lastRecommendation';

export type WizardState = {
  major: WizardMajor | null;
  direction: WizardDirection | null;
  careerGoal: string;
  selectedInterests: InterestOption[];
  initialIdeas: string;
  excludeTopics: string;
};

export type RecommendationResult = {
  mode: 'recommendation';
  recommendationId: string;
  intentId: string;
  explain?: string;
  bestTopic: {
    topic_id: string;
    title: string;
    description: string | null;
    shortDescription?: string | null;
    short_description?: string | null;
    area: string;
    thesis_type: string | null;
    interests?: string[];
  };
  scores: {
    finalScore: number;
    topicRank: number;
    topicRankNorm: number;
    coverage: number | null;
    interestMatchScore: number | null;
  };
};

@Injectable({ providedIn: 'root' })
export class ThesisWizardService {
  state: WizardState = {
    major: null,
    direction: null,
    careerGoal: '',
    selectedInterests: [],
    initialIdeas: '',
    excludeTopics: ''
  };
  lastRecommendation: RecommendationResult | null = this.restoreRecommendation();

  update(partial: Partial<WizardState>) {
    Object.assign(this.state, partial);
  }

  setLastRecommendation(result: RecommendationResult) {
    this.lastRecommendation = result;
    localStorage.setItem(QUIZ_RESULT_STORAGE_KEY, JSON.stringify(result));
  }

  clearLastRecommendation() {
    this.lastRecommendation = null;
    localStorage.removeItem(QUIZ_RESULT_STORAGE_KEY);
  }

  reset() {
    this.state.major = null;
    this.state.direction = null;
    this.state.careerGoal = '';
    this.state.selectedInterests = [];
    this.state.initialIdeas = '';
    this.state.excludeTopics = '';
    this.clearLastRecommendation();
  }

  private restoreRecommendation(): RecommendationResult | null {
    const raw = localStorage.getItem(QUIZ_RESULT_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<RecommendationResult> | null;
      if (!parsed || parsed.mode !== 'recommendation' || !parsed.bestTopic || !parsed.scores) {
        localStorage.removeItem(QUIZ_RESULT_STORAGE_KEY);
        return null;
      }
      return parsed as RecommendationResult;
    } catch {
      localStorage.removeItem(QUIZ_RESULT_STORAGE_KEY);
      return null;
    }
  }
}

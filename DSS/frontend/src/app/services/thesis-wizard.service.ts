import { Injectable } from '@angular/core';

export type WizardMajor = 'IT' | 'CS' | 'DS';
export type WizardDirection = 'research' | 'practical' | 'not_defined';

export type WizardState = {
  major: WizardMajor | null;
  direction: WizardDirection | null;
  careerGoal: string;
  interests: string;
  initialIdeas: string;
  excludeTopics: string;
};

@Injectable({ providedIn: 'root' })
export class ThesisWizardService {
  state: WizardState = {
    major: null,
    direction: null,
    careerGoal: '',
    interests: '',
    initialIdeas: '',
    excludeTopics: ''
  };

  update(partial: Partial<WizardState>) {
    Object.assign(this.state, partial);
  }

  reset() {
    this.state.major = null;
    this.state.direction = null;
    this.state.careerGoal = '';
    this.state.interests = '';
    this.state.initialIdeas = '';
    this.state.excludeTopics = '';
  }
}

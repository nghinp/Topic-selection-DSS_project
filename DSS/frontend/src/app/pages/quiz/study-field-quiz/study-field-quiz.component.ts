import { CommonModule, Location } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../../components/navbar/navbar.component';
import { ThesisWizardService, WizardState } from '../../../services/thesis-wizard.service';
import { HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-study-field-quiz',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HttpClientModule, NavbarComponent],
  templateUrl: './study-field-quiz.component.html',
  styleUrl: './study-field-quiz.component.scss'
})
export class StudyFieldQuizComponent {
  wizard: WizardState;
  showErrors = false;

  constructor(
    private readonly wizardService: ThesisWizardService,
    private readonly router: Router,
    private readonly location: Location
  ) {
    this.wizard = this.wizardService.state;
  }

  get isStepValid() {
    return Boolean(this.wizard.major && this.wizard.direction);
  }

  onBack() {
    this.location.back();
  }

  onFieldChange() {
    if (this.showErrors) {
      this.showErrors = !this.isStepValid;
    }
  }

  onNextAttempt() {
    if (!this.isStepValid) {
      this.showErrors = true;
      return;
    }
    this.showErrors = false;
    this.router.navigate(['/study-field-quiz/step-2']);
  }
}

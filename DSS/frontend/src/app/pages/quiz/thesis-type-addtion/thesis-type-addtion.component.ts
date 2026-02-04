import { CommonModule, Location } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../../components/navbar/navbar.component';
import { ThesisWizardService, WizardState } from '../../../services/thesis-wizard.service';

@Component({
  selector: 'app-thesis-type-addtion',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  templateUrl: './thesis-type-addtion.component.html',
  styleUrl: './thesis-type-addtion.component.scss'
})
export class ThesisTypeAddtionComponent {
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
    return Boolean(this.wizard.thesisHint);
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

import { CommonModule, Location } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../../components/navbar/navbar.component';
import { ThesisWizardService, WizardState } from '../../../services/thesis-wizard.service';

@Component({
  selector: 'app-career-interests',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  templateUrl: './career-interests.component.html',
  styleUrl: './career-interests.component.scss'
})
export class CareerInterestsComponent {
  wizard: WizardState;

  constructor(
    private readonly wizardService: ThesisWizardService,
    private readonly router: Router,
    private readonly location: Location
  ) {
    this.wizard = this.wizardService.state;
  }

  onBack() {
    this.location.back();
  }

  onNext() {
    this.router.navigate(['/study-field-quiz/submit']);
  }
}

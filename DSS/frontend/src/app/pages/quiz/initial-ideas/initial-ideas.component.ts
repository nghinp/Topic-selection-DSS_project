import { CommonModule, Location } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../../components/navbar/navbar.component';
import { ThesisWizardService, WizardState } from '../../../services/thesis-wizard.service';

@Component({
  selector: 'app-initial-ideas',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  templateUrl: './initial-ideas.component.html',
  styleUrl: './initial-ideas.component.scss'
})
export class InitialIdeasComponent {
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
    this.router.navigate(['/study-field-quiz/career-interests']);
  }
}

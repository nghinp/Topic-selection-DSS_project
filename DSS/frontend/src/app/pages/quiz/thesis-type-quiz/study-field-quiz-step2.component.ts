import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { NavbarComponent } from '../../../components/navbar/navbar.component';

@Component({
  selector: 'app-study-field-quiz-step2',
  standalone: true,
  imports: [CommonModule, NavbarComponent],
  templateUrl: './study-field-quiz-step2.component.html',
  styleUrl: './study-field-quiz-step2.component.scss'
})
export class StudyFieldQuizStep2Component {}

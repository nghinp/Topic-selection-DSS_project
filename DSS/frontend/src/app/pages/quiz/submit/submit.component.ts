import { CommonModule, Location } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../../components/navbar/navbar.component';

@Component({
  selector: 'app-submit',
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent],
  templateUrl: './submit.component.html',
  styleUrl: './submit.component.scss'
})
export class SubmitComponent {
  constructor(private readonly location: Location) {}

  onBack() {
    this.location.back();
  }
}

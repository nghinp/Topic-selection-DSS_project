import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { TopicSearchResult, TopicsService } from '../../services/topics.service';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NavbarComponent],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss'
})
export class SearchComponent implements OnInit, OnDestroy {
  keyword = '';
  searching = false;
  searchError = '';
  hasSearched = false;
  results: TopicSearchResult[] = [];

  private sub?: Subscription;

  constructor(
    private readonly topics: TopicsService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.sub = this.route.queryParamMap.subscribe((params) => {
      const q = (params.get('q') || '').trim();
      this.keyword = q;
      if (!q) {
        this.results = [];
        this.hasSearched = false;
        this.searchError = '';
        return;
      }
      this.runSearch(q);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  submit(): void {
    const query = this.keyword.trim();
    this.searchError = '';
    if (!query) {
      this.searchError = 'Enter a keyword to search topics.';
      this.results = [];
      this.hasSearched = false;
      return;
    }
    this.router.navigate([], { relativeTo: this.route, queryParams: { q: query }, queryParamsHandling: 'merge' });
  }

  private runSearch(query: string): void {
    this.searching = true;
    this.hasSearched = true;
    this.searchError = '';
    this.topics.search(query).subscribe({
      next: (rows) => {
        this.results = rows;
        this.searching = false;
      },
      error: () => {
        this.searchError = 'Could not search topics right now.';
        this.results = [];
        this.searching = false;
      }
    });
  }
}

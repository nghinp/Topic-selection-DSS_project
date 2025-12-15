import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { TopicsService, TopicRecord } from '../../services/topics.service';
import { AREA_LABELS } from '../../constants/areas';

@Component({
  selector: 'app-topic-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent],
  templateUrl: './topic-detail.component.html',
  styleUrl: './topic-detail.component.scss'
})
export class TopicDetailComponent implements OnInit {
  protected topic: TopicRecord | null = null;
  protected loading = false;
  protected error = '';
  protected imageSrc: string | null = null;
  protected descriptionClean = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly topics: TopicsService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) {
        this.error = 'Topic not found.';
        return;
      }
      this.fetchTopic(id);
    });
  }

  protected areaLabel(area: string): string {
    return AREA_LABELS[area] || area;
  }

  protected back(): void {
    this.router.navigate(['/explore']);
  }

  private fetchTopic(id: string): void {
    this.loading = true;
    this.error = '';
    this.topic = null;
    this.topics.getById(id).subscribe({
      next: (t) => {
        this.topic = t;
        this.imageSrc = this.deriveImage(t);
        this.descriptionClean = this.cleanDescription(t.description);
        this.loading = false;
      },
      error: () => {
        this.error = 'Could not load topic.';
        this.loading = false;
      }
    });
  }

  private deriveImage(topic: TopicRecord): string | null {
    const url = topic.imageUrl?.trim();
    if (url) return url;
    const desc = topic.description || '';
    const md = desc.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (md?.[1]) return md[1];
    const dataUrl = desc.match(/(data:image\/[^\s)]+)/i);
    if (dataUrl?.[1]) return dataUrl[1];
    const http = desc.match(/(https?:\/\/\S+\.(?:png|jpe?g|gif|webp))/i);
    if (http?.[1]) return http[1];
    return null;
  }

  private cleanDescription(desc?: string | null): string {
    if (!desc) return '';
    return desc.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
  }
}

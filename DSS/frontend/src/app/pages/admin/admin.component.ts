import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { AdminTopic, AdminTopicsService } from '../../services/admin-topics.service';
import { INTEREST_OPTIONS, InterestOption } from '../../constants/interests';
import { EMPTY_TOPIC_DETAIL_CONTENT, TopicDetailContent } from '../../types/topic-detail-content';

function createEmptyDetailContent(): TopicDetailContent {
  return {
    problemOverview: [...EMPTY_TOPIC_DETAIL_CONTENT.problemOverview],
    researchObjectives: [...EMPTY_TOPIC_DETAIL_CONTENT.researchObjectives],
    methodology: [...EMPTY_TOPIC_DETAIL_CONTENT.methodology],
    technologies: [...EMPTY_TOPIC_DETAIL_CONTENT.technologies]
  };
}

type DraftTopic = {
  id?: string;
  area: string;
  title: string;
  description: string;
  shortDescription: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | '';
  thesisType: 'Research' | 'Practical' | '';
  interests: InterestOption[];
  detailContent: TopicDetailContent;
};

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit {
  protected topics: AdminTopic[] = [];
  protected loading = false;
  protected saving = false;
  protected error = '';
  protected success = '';

  protected draft: DraftTopic = {
    area: '',
    title: '',
    description: '',
    shortDescription: '',
    difficulty: '',
    thesisType: '',
    interests: [],
    detailContent: createEmptyDetailContent()
  };
  protected editingId: string | null = null;
  protected areaOptions = [
    'AI & Machine Learning',
    'Data Science & Mining',
    'Computer Vision & Multimedia',
    'Web & Software Systems',
    'Cybersecurity & Networks',
    'IoT & Embedded Systems',
    'Graphics, Games & HCI'
  ];
  protected interestOptions = INTEREST_OPTIONS;
  protected difficultyOptions = ['Beginner', 'Intermediate', 'Advanced'] as const;

  constructor(private readonly adminTopics: AdminTopicsService) {}

  ngOnInit(): void {
    this.loadTopics();
  }

  protected loadTopics(): void {
    this.loading = true;
    this.error = '';
    this.adminTopics.list().subscribe({
      next: (rows) => {
        this.topics = rows;
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load topics';
        this.loading = false;
      }
    });
  }

  protected submit(): void {
    if (!this.draft.area || !this.draft.title || !this.draft.thesisType) {
      this.error = 'Area, title and thesis type are required';
      return;
    }
    const payload = {
      area: this.draft.area,
      title: this.draft.title.trim(),
      description: this.draft.description?.trim() || null,
      shortDescription: this.draft.shortDescription?.trim() || null,
      difficulty: this.draft.difficulty || null,
      thesisType: this.draft.thesisType,
      interests: this.draft.interests,
      detailContent: this.draft.detailContent
    };
    this.saving = true;
    this.error = '';
    this.success = '';

    const request = this.editingId
      ? this.adminTopics.update(this.editingId, payload)
      : this.adminTopics.create(payload);

    request.subscribe({
      next: (topic) => {
        if (this.editingId) {
          this.topics = this.topics.map((t) => (t.id === topic.id ? topic : t));
          this.success = 'Topic updated';
        } else {
          this.topics = [topic, ...this.topics];
          this.success = 'Topic added';
        }
        this.resetForm();
      },
      error: () => {
        this.error = 'Save failed';
        this.saving = false;
      }
    });
  }

  protected edit(topic: AdminTopic): void {
    this.editingId = topic.id ?? null;
    this.draft = {
      id: topic.id,
      area: topic.area,
      title: topic.title,
      description: topic.description ?? '',
      shortDescription: topic.shortDescription ?? '',
      difficulty: topic.difficulty || '',
      thesisType: topic.thesisType || '',
      interests: (topic.interests ?? []) as InterestOption[],
      detailContent: topic.detailContent ?? createEmptyDetailContent()
    };
    this.success = '';
    this.error = '';
  }

  protected remove(id?: string): void {
    if (!id) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.adminTopics.remove(id).subscribe({
      next: () => {
        this.topics = this.topics.filter((t) => t.id !== id);
        this.saving = false;
        this.success = 'Topic removed';
        if (this.editingId === id) this.resetForm();
      },
      error: () => {
        this.error = 'Delete failed';
        this.saving = false;
      }
    });
  }

  protected resetForm(): void {
    this.editingId = null;
    this.draft = {
      area: '',
      title: '',
      description: '',
      shortDescription: '',
      difficulty: '',
      thesisType: '',
      interests: [],
      detailContent: createEmptyDetailContent()
    };
    this.saving = false;
  }

  protected trackById(_index: number, item: AdminTopic): string {
    return item.id ?? '';
  }

  protected toggleInterest(value: InterestOption, checked: boolean): void {
    const next = checked
      ? Array.from(new Set([...this.draft.interests, value]))
      : this.draft.interests.filter((interest) => interest !== value);
    this.draft = { ...this.draft, interests: next };
  }

  protected isInterestSelected(value: InterestOption): boolean {
    return this.draft.interests.includes(value);
  }

  protected updateDetailSection(section: keyof TopicDetailContent, value: string): void {
    this.draft = {
      ...this.draft,
      detailContent: {
        ...this.draft.detailContent,
        [section]: value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
      }
    };
  }

  protected sectionText(section: keyof TopicDetailContent): string {
    return (this.draft.detailContent[section] || []).join('\n');
  }
}

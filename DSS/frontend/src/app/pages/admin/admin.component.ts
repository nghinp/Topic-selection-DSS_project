import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { AdminTopic, AdminTopicsService } from '../../services/admin-topics.service';

type DraftTopic = { id?: string; area: string; title: string; description: string; imageUrl?: string | null };

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
    description: ''
  };
  protected editingId: string | null = null;
  protected areaOptions = ['AI', 'DATA', 'SEC', 'WEB', 'MOBILE', 'CLOUD', 'NET', 'IOT', 'WEB3', 'UX', 'PM'];

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
    if (!this.draft.area || !this.draft.title) {
      this.error = 'Area and title are required';
      return;
    }
    const payload = {
      area: this.draft.area,
      title: this.draft.title.trim(),
      description: this.draft.description?.trim() || null,
      imageUrl: null
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
      description: topic.description ?? ''
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
    this.draft = { area: '', title: '', description: '' };
    this.saving = false;
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result?.toString() || '';
      const current = this.draft.description?.trim() || '';
      const appended = `${current}${current ? '\n\n' : ''}![image](${result})`;
      this.draft = { ...this.draft, description: appended };
    };
    reader.readAsDataURL(file);
  }

  protected trackById(_index: number, item: AdminTopic): string {
    return item.id ?? '';
  }
}

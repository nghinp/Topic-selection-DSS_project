import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import API_ENDPOINTS from '../constants/api';
import { TopicDetailContent } from '../types/topic-detail-content';

export interface AdminTopic {
  id?: string;
  area: string;
  title: string;
  description?: string | null;
  shortDescription?: string | null;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced' | null;
  thesisType?: 'Research' | 'Practical' | null;
  interests?: string[];
  detailContent?: TopicDetailContent;
  imageUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminTopicsService {
  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<AdminTopic[]>(API_ENDPOINTS.adminTopics);
  }

  create(topic: Pick<AdminTopic, 'area' | 'title' | 'description' | 'shortDescription' | 'difficulty' | 'imageUrl' | 'thesisType' | 'interests' | 'detailContent'>) {
    return this.http.post<AdminTopic>(API_ENDPOINTS.adminTopics, topic);
  }

  update(id: string, topic: Pick<AdminTopic, 'area' | 'title' | 'description' | 'shortDescription' | 'difficulty' | 'imageUrl' | 'thesisType' | 'interests' | 'detailContent'>) {
    return this.http.put<AdminTopic>(`${API_ENDPOINTS.adminTopics}/${id}`, topic);
  }

  remove(id: string) {
    return this.http.delete<{ ok: boolean }>(`${API_ENDPOINTS.adminTopics}/${id}`);
  }
}

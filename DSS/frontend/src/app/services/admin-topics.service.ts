import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import API_ENDPOINTS from '../constants/api';

export interface AdminTopic {
  id?: string;
  area: string;
  title: string;
  description?: string | null;
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

  create(topic: Pick<AdminTopic, 'area' | 'title' | 'description' | 'imageUrl'>) {
    return this.http.post<AdminTopic>(API_ENDPOINTS.adminTopics, topic);
  }

  update(id: string, topic: Pick<AdminTopic, 'area' | 'title' | 'description' | 'imageUrl'>) {
    return this.http.put<AdminTopic>(`${API_ENDPOINTS.adminTopics}/${id}`, topic);
  }

  remove(id: string) {
    return this.http.delete<{ ok: boolean }>(`${API_ENDPOINTS.adminTopics}/${id}`);
  }
}

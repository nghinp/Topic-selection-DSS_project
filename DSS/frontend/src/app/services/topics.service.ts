import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API_ENDPOINTS } from '../constants/api';

export interface TopicSearchResult {
  id?: string;
  area: string;
  title: string;
  description?: string | null;
}

export interface TopicRecord {
  id: string;
  area: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class TopicsService {
  constructor(private readonly http: HttpClient) {}

  search(keyword: string) {
    const params = new HttpParams().set('q', keyword.trim());
    return this.http.get<TopicSearchResult[]>(API_ENDPOINTS.searchTopics, { params });
  }

  listAll() {
    return this.http.get<TopicRecord[]>(API_ENDPOINTS.topics);
  }

  getById(id: string) {
    return this.http.get<TopicRecord>(API_ENDPOINTS.topicDetail(id));
  }
}

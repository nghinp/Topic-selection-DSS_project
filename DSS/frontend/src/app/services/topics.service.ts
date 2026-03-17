import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API_ENDPOINTS } from '../constants/api';
import { TopicDetailContent } from '../types/topic-detail-content';
import { map } from 'rxjs/operators';

export interface TopicSearchResult {
  id?: string;
  area: string;
  title: string;
  description?: string | null;
  thesisType?: 'Research' | 'Practical' | null;
  shortDescription?: string | null;
  difficulty?: string | null;
  interests?: string[];
  detailContent?: TopicDetailContent;
}

export interface TopicRecord {
  id: string;
  area: string;
  title: string;
  description?: string | null;
  thesisType?: 'Research' | 'Practical' | null;
  shortDescription?: string | null;
  difficulty?: string | null;
  interests?: string[];
  detailContent?: TopicDetailContent;
  imageUrl?: string | null;
}

type RawTopicRecord = TopicRecord & {
  thesis_type?: 'Research' | 'Practical' | null;
  short_description?: string | null;
  detail_content?: TopicDetailContent;
};

@Injectable({ providedIn: 'root' })
export class TopicsService {
  constructor(private readonly http: HttpClient) {}

  search(keyword: string) {
    const params = new HttpParams().set('q', keyword.trim());
    return this.http
      .get<RawTopicRecord[]>(API_ENDPOINTS.searchTopics, { params })
      .pipe(map((rows) => rows.map((row) => this.normalizeTopic(row))));
  }

  listAll() {
    return this.http
      .get<RawTopicRecord[]>(API_ENDPOINTS.topics)
      .pipe(map((rows) => rows.map((row) => this.normalizeTopic(row))));
  }

  getById(id: string) {
    return this.http
      .get<RawTopicRecord>(API_ENDPOINTS.topicDetail(id))
      .pipe(map((row) => this.normalizeTopic(row)));
  }

  private normalizeTopic(row: RawTopicRecord): TopicRecord {
    return {
      ...row,
      thesisType: row.thesisType ?? row.thesis_type ?? null,
      shortDescription: row.shortDescription ?? row.short_description ?? null,
      detailContent: row.detailContent ?? row.detail_content ?? undefined,
      interests: row.interests ?? []
    };
  }
}

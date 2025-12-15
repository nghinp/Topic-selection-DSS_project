const API_BASE = 'http://localhost:3000/api';

export const API_ENDPOINTS = {
  base: API_BASE,
  questions: `${API_BASE}/questions`,
  submissions: `${API_BASE}/submissions`,
  savedTopics: `${API_BASE}/saved-topics`,
  adminTopics: `${API_BASE}/admin/topics`,
  topics: `${API_BASE}/topics`,
  topicDetail: (id: string) => `${API_BASE}/topics/${id}`,
  searchTopics: `${API_BASE}/topics/search`
};

export type ApiSubmissionResponse = {
  id: string;
  thesisType: string;
  scores: Record<string, number>;
  topAreas: string[];
  answered: number;
  total: number;
};

export default API_ENDPOINTS;

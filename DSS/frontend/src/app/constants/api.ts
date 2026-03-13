const API_BASE = 'http://localhost:3000/api';

export const API_ENDPOINTS = {
  base: API_BASE,
  recommendation: `${API_BASE}/recommendation/hybrid`,
  savedTopics: `${API_BASE}/saved-topics`,
  adminTopics: `${API_BASE}/admin/topics`,
  topics: `${API_BASE}/topics`,
  topicDetail: (id: string) => `${API_BASE}/topics/${id}`,
  searchTopics: `${API_BASE}/topics/search`
};

export default API_ENDPOINTS;

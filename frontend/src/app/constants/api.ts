const API_BASE = 'http://localhost:3000/api';

export const API_ENDPOINTS = {
  base: API_BASE,
  savedTopics: `${API_BASE}/saved-topics`,
  adminTopics: `${API_BASE}/admin/topics`,
  topics: `${API_BASE}/topics`,
  topicDetail: (id: string) => `${API_BASE}/topics/${id}`,
  searchTopics: `${API_BASE}/topics/search`,
  recommendations: `${API_BASE}/recommendations`,
  topicGenerationConfig: `${API_BASE}/topic-generation/config`,
  topicGenerationGenerate: `${API_BASE}/topic-generation/generate`,
  topicGenerationSave: `${API_BASE}/topic-generation/save`,
  topicGenerationSaved: `${API_BASE}/topic-generation/saved`
};

export default API_ENDPOINTS;

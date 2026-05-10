import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import topicRoutes from './routes/topics.js';
import savedTopicsRoutes from './routes/savedTopics.js';
import adminTopicsRoutes from './routes/adminTopics.js';
import recommendationRoutes from './routes/recommendations.js';
import topicGenerationRoutes from './routes/topicGeneration.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/topics', topicRoutes);
  app.use('/api/saved-topics', savedTopicsRoutes);
  app.use('/api/admin/topics', adminTopicsRoutes);
  app.use('/api/recommendations', recommendationRoutes);
  app.use('/api/topic-generation', topicGenerationRoutes);

  app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

  return app;
}

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Routes
import authRoutes from './routes/auth.js';
import topicRoutes from './routes/topics.js';
import savedTopicsRoutes from './routes/savedTopics.js';
import adminTopicsRoutes from './routes/adminTopics.js';
import recommendationRoutes from './routes/recommendations.js';
import topicGenerationRoutes from './routes/topicGeneration.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Universal Middleware
app.use(cors());
app.use(express.json());

// API Route Mappings
app.use('/api/auth', authRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/saved-topics', savedTopicsRoutes);
app.use('/api/admin/topics', adminTopicsRoutes);
app.use('/api/recommendation', recommendationRoutes);
app.use('/api/recommendations', recommendationRoutes); // Alias for history
app.use('/api/topic-generation', topicGenerationRoutes);

import { pool } from './config/database.js';
pool.query(`
  CREATE TABLE IF NOT EXISTS generated_topics (
    id UUID PRIMARY KEY,
    user_id UUID,
    title TEXT NOT NULL,
    review_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(console.error);

// Health Check
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.listen(port, () => {
  console.log(`API Base: http://localhost:${port}`);
});

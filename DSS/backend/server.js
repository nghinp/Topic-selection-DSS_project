import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Routes
import authRoutes from './routes/auth.js';
import topicRoutes from './routes/topics.js';
import savedTopicsRoutes from './routes/savedTopics.js';
import adminTopicsRoutes from './routes/adminTopics.js';
import recommendationRoutes from './routes/recommendations.js';

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

// Health Check
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// Start Server
app.listen(port, () => {
  console.log(`
  🚀 DSS Backend Refactored & Ready
  📡 API Base: http://localhost:${port}
  
  Route Groups:
  - Auth: /api/auth (login, register)
  - Topics: /api/topics (public catalog)
  - Favorites: /api/saved-topics (user bookmarks)
  - Admin: /api/admin/topics (management)
  - Engine: /api/recommendation (hybrid results)
  `);
});

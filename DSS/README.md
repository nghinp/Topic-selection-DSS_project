# Thesis Topic Decision Support System (DSS)

SPA (Angular) + REST API (Express) + PostgreSQL. Users take a quiz, get recommendations, browse/save topics; admins manage topics.

## Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+ (or compatible)
- Optional: Docker for Postgres

## Structure
- `DSS/backend/` — Express API, connects to Postgres
- `DSS/frontend/` — Angular SPA

## Setup
### Backend
```bash
cd DSS/backend
npm install
```
Create `.env`:
```
DATABASE_URL=postgres://postgres:password@localhost:5432/dss
PORT=3000
ADMIN_EMAILS=admin@test.com
```

### Frontend
```bash
cd DSS/frontend
npm install
```

## Database
Run in psql on DB `dss`:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_submissions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  answers JSONB,
  scores JSONB,
  top_areas TEXT[],
  thesis_type TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY,
  area TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_topics (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Seed topics (run once):
```sql
INSERT INTO topics (id, area, title, description, image_url) VALUES
  (gen_random_uuid(), 'AI', 'Deep Learning for Plant Disease Classification', NULL, NULL),
  (gen_random_uuid(), 'AI', 'Student Dropout Prediction using Machine Learning', NULL, NULL),
  (gen_random_uuid(), 'AI', 'NLP Chatbot for University Support', NULL, NULL),
  (gen_random_uuid(), 'AI', 'Anomaly Detection for Campus IoT Systems', NULL, NULL),
  (gen_random_uuid(), 'DATA', 'Student Performance Prediction Dashboard', NULL, NULL),
  (gen_random_uuid(), 'DATA', 'Social Media Sentiment Visualization', NULL, NULL),
  (gen_random_uuid(), 'DATA', 'Real-time Dashboard for University KPIs', NULL, NULL),
  (gen_random_uuid(), 'SEC', 'Phishing Detection Browser Plugin', NULL, NULL),
  (gen_random_uuid(), 'SEC', 'API Security Testing Framework', NULL, NULL),
  (gen_random_uuid(), 'WEB', 'Research Collaboration Web Portal', NULL, NULL),
  (gen_random_uuid(), 'WEB', 'Online Examination Platform', NULL, NULL),
  (gen_random_uuid(), 'WEB', 'Discussion Forum with AI Moderation', NULL, NULL),
  (gen_random_uuid(), 'MOBILE', 'Campus Companion Mobile Application', NULL, NULL),
  (gen_random_uuid(), 'MOBILE', 'AR Campus Navigation App', NULL, NULL),
  (gen_random_uuid(), 'CLOUD', 'Secure Cloud Deployment Pipeline', NULL, NULL),
  (gen_random_uuid(), 'CLOUD', 'Cloud Native Monitoring Platform', NULL, NULL),
  (gen_random_uuid(), 'NET', 'Network Health Monitoring Dashboard', NULL, NULL),
  (gen_random_uuid(), 'NET', 'Intrusion Detection System Prototype', NULL, NULL),
  (gen_random_uuid(), 'IOT', 'Smart Lab Environment Monitoring System', NULL, NULL),
  (gen_random_uuid(), 'IOT', 'IoT Enabled Waste Management System', NULL, NULL),
  (gen_random_uuid(), 'WEB3', 'Academic Credential Verification on Blockchain', NULL, NULL),
  (gen_random_uuid(), 'WEB3', 'Decentralized File Storage for Research Data', NULL, NULL),
  (gen_random_uuid(), 'UX', 'Usability Testing Toolkit for Student Portals', NULL, NULL),
  (gen_random_uuid(), 'UX', 'UX Metrics Dashboard', NULL, NULL),
  (gen_random_uuid(), 'PM', 'Project Health Dashboard for Capstone Projects', NULL, NULL),
  (gen_random_uuid(), 'PM', 'Agile Sprint Planning Tool for Students', NULL, NULL)
ON CONFLICT DO NOTHING;
```

## Run
Backend:
```bash
cd DSS/backend
npm run dev   # or npm start
# API: http://localhost:3000
```
Frontend:
```bash
cd DSS/frontend
npm start
# App: http://localhost:4200
```

## Key API endpoints
- Auth: `POST /api/auth/register`, `POST /api/auth/login`
- Quiz: `GET /api/questions`, `POST /api/submissions`, `GET /api/submissions`, `GET /api/submissions/:id`
- Topics: `GET /api/topics`, `GET /api/topics/search?q=...`, `GET /api/topics/:id`
- Saved topics: `GET/POST/DELETE /api/saved-topics`
- Admin (email in `ADMIN_EMAILS`):
  - `GET /api/admin/topics`
  - `POST /api/admin/topics` { area, title, description?, imageUrl? }
  - `PUT /api/admin/topics/:id`
  - `DELETE /api/admin/topics/:id`

## Frontend features
- Home: search, featured topics, metrics (total topics, areas, saved count), saved topics (if logged in)
- Explore: browse all topics, filter by area, click to detail, save (login required)
- Topic detail: title, area label, description, image (from `image_url` or embedded in description as markdown/data URL)
- Quiz/Result: take questionnaire, see recommendations + suggested topics (clickable), save topics (login)
- Admin: CRUD topics; description supports embedded images (file upload inserts data URL), optional `imageUrl`

## Notes
- Image upload currently embeds data URL inside description (no server file storage).
- If `topics` table is empty, seed via SQL above or restart backend to auto-seed when empty.
- Update `DATABASE_URL` to match your Postgres credentials.

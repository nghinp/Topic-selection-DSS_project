# Thesis Topic Decision Support System (DSS)

SPA (Angular) + REST API (Express) + PostgreSQL. Phase 2 uses Postgres Full-Text Search to recommend one best thesis topic with Filter -> Score -> Select.

## Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+ (or compatible)
- Optional: Docker for Postgres

## Structure
- `backend/` - Express API, routes, config, SQL, and backend test scripts.
- `frontend/` - Angular source files.
- `tools/` - local maintenance scripts.

## Setup
### Backend
```bash
cd backend
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
cd .
npm install
```

## Database
Run the base schema in psql on DB `dss`:
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

Run Phase 2 migration:
```bash
psql "$DATABASE_URL" -f backend/sql/hybrid_recommendation.sql
```


Hybrid flow:
- Extract keywords from `includeKeywords + careerAim + interests + major`
- Hard filter with `excludeKeywords`
- Gate candidates by major allowlist and thesis preference
- Validate with keyword coverage threshold and thesis-type cues for NULL topic types
- Light-rank with `FinalScore = 0.8*topicRankNorm + 0.2*coverage`
- Select exactly 1 topic by `ORDER BY final_score DESC, topic_rank DESC, created_at DESC`

## Topic Generation Complexity
The rule-based topic generation flow uses a fixed-size candidate generation process. It validates the student's academic profile, selects suitable template families, generates candidate thesis topics, removes duplicates, filters invalid candidates, scores the remaining candidates, and returns the highest-ranked result.

Notation:
- `T`: number of templates or template rules checked.
- `C`: number of generated candidate topics.
- `R`: number of filtering and scoring rules.
- `L`: number of log messages or explanation entries.

Time complexity:
- Input validation is `O(1)` because the number of profile fields is fixed.
- Template selection is `O(T)` because matching rules and templates are checked against the profile.
- Candidate generation is `O(C)`, or `O(C * S)` if template slots are counted separately, where `S` is the number of slots per template. Since `S` is small and bounded, this simplifies to `O(C)`.
- Duplicate detection is `O(C^2)` because generated candidates may be compared with previously generated candidates to remove repeated or highly similar titles.
- Candidate filtering and scoring are `O(C * R)` because each candidate is checked against multiple rules.
- Best-topic selection is `O(C)` because the system scans scored candidates to find the highest-ranked topic.

Overall general time complexity:
```text
O(T + C^2 + C * R)
```

In the current implementation, `C` is fixed at 30 candidates, so practical runtime is near constant for each request:
```text
O(1)
```

Space complexity:
- The input profile uses `O(1)` memory because the number of fields is fixed.
- Configuration data such as templates, component pools, skill sets, and feature tags uses application-level memory of `O(T + P)`, where `P` is the number of component pool items. This data is static and reused across requests.
- Generated candidates use `O(C)` memory.
- Unique candidates use `O(C)` memory in the worst case.
- Valid candidates use `O(C)` memory in the worst case.
- Rejected candidates and rejection reasons use `O(C)` memory in the worst case.
- Score breakdowns use `O(C)` memory because each candidate stores a bounded set of score fields.
- Logs use `O(L)` memory.

Overall per-request space complexity:
```text
O(C + L)
```

Because the number of generated candidates and log entries is bounded in the current system, the practical per-request space complexity is:
```text
O(1)
```

In summary, the theoretical topic generation complexity is `O(T + C^2 + C * R)` time and `O(C + L)` space. In practice, because the candidate count is fixed, both runtime and per-request memory usage behave as near constant.

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
cd backend
npm run dev   # or npm start
# API: http://localhost:3000
```
Frontend:
```bash
cd .
npm start
# App: http://localhost:4200
```

Topic generation checks:
```bash
npm run test:topic-quality
npm run test:topic-stress -- -Iterations 10
```

Maintenance tools:
```bash
npm run tools:validate-vocab
```

## Key API endpoints
- Auth: `POST /api/auth/register`, `POST /api/auth/login`
- Recommendation history: `GET /api/recommendations`
- Topic generation: `GET /api/topic-generation/config`, `POST /api/topic-generation/generate`
- Topics: `GET /api/topics`, `POST /api/topics/search`, `GET /api/topics/:id`
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
- Topic generation: build thesis title candidates from specialization, direction, skills, and feature tags.
- Admin: CRUD topics; description supports embedded images (file upload inserts data URL), optional `imageUrl`

## Notes
- Image upload currently embeds data URL inside description (no server file storage).
- If `topics` table is empty, seed via SQL above or restart backend to auto-seed when empty.
- Update `DATABASE_URL` to match your Postgres credentials.

## Topic Generation API example
```bash
curl -X POST http://localhost:3000/api/topic-generation/generate \
  -H "Content-Type: application/json" \
  -d '{
    "major": "CS",
    "technical_specialization": "machine_learning",
    "application_direction": "education_learning",
    "thesis_type": "Research",
    "skills": ["python", "machine_learning"],
    "feature_tags": ["user_friendly"],
    "exclude_keywords": []
  }'
```

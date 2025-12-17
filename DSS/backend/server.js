import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { questions } from './data/questions.js';
import { choices } from './data/choices.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const port = process.env.PORT || 3000;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
app.get('/api/questions', (_, res) => res.json({ questions, choices }));

// Auth
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name = null } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount) return res.status(409).json({ message: 'Email already exists' });

    const userId = randomUUID();
    const passwordHash = hashPassword(password);
    await pool.query('INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)', [userId, email, passwordHash, name]);

    const token = await issueToken(userId);
    res.json({ token, user: { id: userId, email, name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Register failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'email and password are required' });
  try {
    const result = await pool.query('SELECT id, password_hash, name FROM users WHERE email = $1', [email]);
    if (!result.rowCount) return res.status(401).json({ message: 'Invalid credentials' });
    const row = result.rows[0];
    if (!verifyPassword(password, row.password_hash)) return res.status(401).json({ message: 'Invalid credentials' });

    const token = await issueToken(row.id);
    res.json({ token, user: { id: row.id, email, name: row.name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
});

// Protected routes
app.get('/api/submissions', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, thesis_type AS "thesisType", scores, top_areas AS "topAreas", duration_ms AS "durationMs", created_at AS "createdAt"
         FROM quiz_submissions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB fetch failed' });
  }
});

app.post('/api/submissions', requireAuthOptional, async (req, res) => {
  const { answers = {}, durationMs = 0 } = req.body || {};
  const sessionToken = getSessionToken(req);
  if (!req.userId && !sessionToken) {
    return res.status(400).json({ message: 'missing session token' });
  }

  const recommendation = computeRecommendation(answers);
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO quiz_submissions (id, user_id, answers, scores, top_areas, thesis_type, duration_ms, session_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        req.userId ?? null,
        answers,
        recommendation.scores,
        recommendation.topAreas,
        recommendation.thesisType,
        durationMs,
        req.userId ? null : sessionToken
      ]
    );
    res.json({
      id,
      ...recommendation,
      answered: Object.keys(answers).length,
      total: questions.length,
      durationMs
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB insert failed' });
  }
});

app.post('/api/submissions/claim', requireAuth, async (req, res) => {
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(400).json({ message: 'missing session token' });
  }
  try {
    const result = await pool.query(
      `UPDATE quiz_submissions
          SET user_id = $1,
              session_token = NULL
        WHERE session_token = $2`,
      [req.userId, sessionToken]
    );
    res.json({ ok: true, claimed: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB claim failed' });
  }
});

app.get('/api/submissions/:id', requireAuthOptional, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM quiz_submissions WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Not found' });
    const row = result.rows[0];
    if (row.user_id && req.userId && row.user_id !== req.userId) return res.status(404).json({ message: 'Not found' });
    res.json({
      id: row.id,
      thesisType: row.thesis_type,
      scores: row.scores,
      topAreas: row.top_areas,
      answered: Object.keys(row.answers || {}).length,
      total: questions.length,
      durationMs: row.duration_ms,
      createdAt: row.created_at
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB fetch failed' });
  }
});

// Saved topics
app.get('/api/saved-topics', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, topic, label, created_at AS "createdAt"
         FROM saved_topics
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB fetch failed' });
  }
});

app.post('/api/saved-topics', requireAuth, async (req, res) => {
  const { topic, label = null } = req.body || {};
  if (!topic) {
    return res.status(400).json({ message: 'topic is required' });
  }
  try {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO saved_topics (id, user_id, topic, label)
       VALUES ($1, $2, $3, $4)`,
      [id, req.userId, topic, label]
    );
    res.json({ id, topic, label });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB insert failed' });
  }
});

app.delete('/api/saved-topics/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM saved_topics WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB delete failed' });
  }
});

// Public: topic search
app.get('/api/topics', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, area, title, description, image_url AS "imageUrl", created_at AS "createdAt"
         FROM topics
        ORDER BY created_at DESC
        LIMIT 500`
    );
    res.json(rows);
  } catch (err) {
    console.error('Topic list failed', err);
    res.status(500).json({ message: 'DB fetch failed' });
  }
});

app.get('/api/topics/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ message: 'q is required' });

  try {
    const term = `%${q}%`;
    const { rows } = await pool.query(
      `SELECT id, area, title, description, image_url AS "imageUrl"
         FROM topics
        WHERE title ILIKE $1
           OR description ILIKE $1
           OR area ILIKE $2
        ORDER BY created_at DESC
        LIMIT 50`,
      [term, term]
    );
    res.json(rows);
  } catch (err) {
    console.error('Topic search failed', err);
    res.status(500).json({ message: 'DB search failed' });
  }
});

app.get('/api/topics/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, area, title, description, image_url AS "imageUrl", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM topics
        WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Topic detail failed', err);
    res.status(500).json({ message: 'DB fetch failed' });
  }
});

// Admin: thesis topics CRUD
app.get('/api/admin/topics', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, area, title, description, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM topics
        ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB fetch failed' });
  }
});

app.post('/api/admin/topics', requireAdmin, async (req, res) => {
  const { area, title, description = null, imageUrl = null } = req.body || {};
  if (!area || !title) return res.status(400).json({ message: 'area and title are required' });
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO topics (id, area, title, description, image_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, area, title, description, imageUrl]
    );
    res.status(201).json({ id, area, title, description, imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB insert failed' });
  }
});

app.put('/api/admin/topics/:id', requireAdmin, async (req, res) => {
  const { area, title, description = null, imageUrl = null } = req.body || {};
  if (!area || !title) return res.status(400).json({ message: 'area and title are required' });
  try {
    const result = await pool.query(
      `UPDATE topics
          SET area = $1,
              title = $2,
              description = $3,
              image_url = $4,
              updated_at = NOW()
        WHERE id = $5
      RETURNING id, area, title, description, image_url AS "imageUrl", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [area, title, description, imageUrl, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB update failed' });
  }
});

app.delete('/api/admin/topics/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM topics WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB delete failed' });
  }
});

app.listen(port, () => console.log(`API on http://localhost:${port}`));

async function issueToken(userId) {
  const token = randomUUID();
  await pool.query('INSERT INTO auth_tokens (token, user_id) VALUES ($1, $2)', [token, userId]);
  return token;
}

async function requireAuth(req, res, next) {
  const user = await getUserByToken(getBearerToken(req));
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  req.userId = user.id;
  req.userEmail = user.email;
  req.authToken = user.token;
  next();
}

async function requireAuthOptional(req, res, next) {
  const user = await getUserByToken(getBearerToken(req));
  if (user) {
    req.userId = user.id;
    req.userEmail = user.email;
    req.authToken = user.token;
  }
  next();
}

async function requireAdmin(req, res, next) {
  const user = await getUserByToken(getBearerToken(req));
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  const email = user.email?.toLowerCase() || '';
  if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  req.userId = user.id;
  req.userEmail = user.email;
  req.authToken = user.token;
  next();
}

async function getUserByToken(token) {
  if (!token) return null;
  if (!isUuid(token)) return null;
  try {
    const result = await pool.query(
      `SELECT t.user_id AS id, u.email AS email, t.token AS token
         FROM auth_tokens t
         LEFT JOIN users u ON u.id = t.user_id
        WHERE t.token = $1`,
      [token]
    );
    if (!result.rowCount) return null;
    return result.rows[0];
  } catch (err) {
    console.error('getUserByToken failed', err);
    return null;
  }
}

function getBearerToken(req) {
  const header = req.header('authorization') || req.header('Authorization');
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
    return parts[1];
  }
  return null;
}

function getSessionToken(req) {
  const header = req.header('x-session-id') || req.header('X-Session-Id');
  if (!header) return null;
  return isUuid(header) ? header : null;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const hash = Buffer.from(hashHex, 'hex');
  const testHash = scryptSync(password, salt, 64);
  return timingSafeEqual(hash, testHash);
}

function isUuid(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value);
}

function computeRecommendation(answers) {
  const get = (id) => answers[id] ?? 0;

  // Section A — thesis type
  const researchScore = (get('q01') + get('q02') + get('q05')) / 3;
  const appScore = (get('q03') + get('q04') + get('q06')) / 3;
  const thesisType = researchScore >= appScore ? 'Research' : 'Practical Application';

  // Section B — working style
  const independent = get('q07') + get('q12');
  const teamwork = get('q08');
  const structured = get('q09') + get('q14');
  const flexible = get('q10') + get('q13');

  const workingFit = {
    AI: (independent + flexible / 2) / 10,
    DATA: (independent + flexible / 2) / 10,
    SEC: (independent + structured) / 10,
    CLOUD: (structured + teamwork / 2) / 10,
    NET: (structured + teamwork / 2) / 10,
    WEB: (teamwork + flexible) / 10,
    MOBILE: (teamwork + flexible) / 10,
    UX: (teamwork + flexible) / 10,
    WEB3: (flexible + independent / 2) / 10,
    IOT: (structured + independent) / 10,
    PM: (structured + teamwork) / 10
  };

  // Section C — interests
  const base = {
    AI: get('q15'),
    DATA: get('q16'),
    SEC: get('q17'),
    WEB: get('q18'),
    MOBILE: get('q19'),
    CLOUD: get('q20'),
    NET: get('q21'),
    IOT: get('q22'),
    WEB3: get('q23'),
    UX: get('q24'),
    PM: get('q25')
  };

  // Section D — skills
  const ability = {
    AI: (get('q26') + get('q12')) / 10,
    DATA: (get('q26') + get('q12')) / 10,
    SEC: get('q29') / 5,
    CLOUD: get('q27') / 5,
    NET: get('q29') / 5,
    WEB: (get('q27') + get('q28')) / 10,
    MOBILE: (get('q27') + get('q28')) / 10,
    UX: get('q30') / 5,
    WEB3: get('q28') / 5,
    IOT: (get('q27') + get('q29')) / 10,
    PM: get('q30') / 5
  };

  const scores = {};
  Object.keys(base).forEach((area) => {
    const interest = base[area] / 5;
    const work = workingFit[area];
    const boost = ability[area];
    const adjustedInterest = interest * (1 + boost * 0.5);
    scores[area] = Math.round((adjustedInterest * 0.7 + work * 0.2 + boost * 0.1) * 100);
  });

  const topAreas = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area]) => area);

  return { thesisType, scores, topAreas };
}

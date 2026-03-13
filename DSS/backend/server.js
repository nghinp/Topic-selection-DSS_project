import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { HYBRID_RECOMMENDATION_CONFIG } from './config/hybridRecommendationConfig.js';

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
const ALLOWED_MAJORS = new Set(['IT', 'CS', 'DS']);
const ALLOWED_PREFERENCES = new Set(['Research', 'Practical', 'Not defined']);
const ALLOWED_TOPIC_THESIS_TYPES = new Set(['Research', 'Practical']);
const ALLOWED_TOPIC_AREAS = new Set([
  'AI & Machine Learning',
  'Data Science & Mining',
  'Computer Vision & Multimedia',
  'Web & Software Systems',
  'Cybersecurity & Networks',
  'IoT & Embedded Systems',
  'Graphics, Games & HCI'
]);
const INSERT_USER_INTENT_SQL = `
  INSERT INTO user_intents (
    user_id, major, thesis_preference, include_keywords, exclude_keywords, career_aim, interests
  ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  RETURNING intent_id
`;
const INSERT_TOPIC_RECOMMENDATION_SQL = `
  INSERT INTO topic_recommendations (rec_id, user_id, intent_id, topic_id, final_score, breakdown)
  VALUES ($1, $2, $3, $4, $5, $6::jsonb)
`;
const HYBRID_RECOMMENDATION_SQL = `
WITH input AS (
  SELECT
    $1::text[] AS major_allowlist,
    NULLIF(BTRIM($2::text), '') AS thesis_preference,
    NULLIF(BTRIM($3::text), '') AS user_query,
    NULLIF(BTRIM($4::text), '') AS exclude_query,
    COALESCE($5::text[], ARRAY[]::text[]) AS extracted_tokens,
    $6::numeric AS coverage_threshold,
    COALESCE($7::text[], ARRAY[]::text[]) AS research_cues,
    COALESCE($8::text[], ARRAY[]::text[]) AS practical_cues
),
ts_input AS (
  SELECT
    i.*,
    CASE
      WHEN i.user_query IS NULL THEN NULL
      ELSE websearch_to_tsquery('english', i.user_query)
    END AS include_tsq,
    CASE
      WHEN i.exclude_query IS NULL THEN NULL
      ELSE websearch_to_tsquery('english', i.exclude_query)
    END AS exclude_tsq
  FROM input i
),
candidates AS (
  SELECT
    tt.topic_id,
    tt.title,
    tt.description,
    tt.area,
    tt.thesis_type,
    tt.created_at,
    tt.search_vec,
    LOWER(CONCAT_WS(' ', tt.title, COALESCE(tt.description, ''), tt.area)) AS search_text,
    ti.thesis_preference,
    ti.include_tsq,
    ti.extracted_tokens,
    ti.coverage_threshold,
    ti.research_cues,
    ti.practical_cues
  FROM thesis_topics tt
  CROSS JOIN ts_input ti
  WHERE tt.area = ANY(ti.major_allowlist)
    AND (ti.exclude_tsq IS NULL OR NOT (tt.search_vec @@ ti.exclude_tsq))
    AND (
      ti.thesis_preference IS NULL
      OR tt.thesis_type IS NULL
      OR tt.thesis_type = ti.thesis_preference
    )
),
validated AS (
  SELECT
    c.topic_id,
    c.title,
    c.description,
    c.area,
    c.thesis_type,
    c.created_at,
    c.thesis_preference,
    CASE
      WHEN c.include_tsq IS NULL THEN 0::real
      ELSE ts_rank(c.search_vec, c.include_tsq)
    END AS topic_rank,
    CASE
      WHEN cardinality(c.extracted_tokens) = 0 THEN NULL::numeric
      ELSE (
        SELECT COUNT(*) FILTER (WHERE POSITION(token IN c.search_text) > 0)::numeric
        FROM unnest(c.extracted_tokens) AS token
      ) / cardinality(c.extracted_tokens)
    END AS coverage,
    (
      SELECT COUNT(*)
      FROM unnest(c.research_cues) AS cue
      WHERE POSITION(cue IN c.search_text) > 0
    ) AS research_cue_hits,
    (
      SELECT COUNT(*)
      FROM unnest(c.practical_cues) AS cue
      WHERE POSITION(cue IN c.search_text) > 0
    ) AS practical_cue_hits,
    c.coverage_threshold
  FROM candidates c
),
coverage_pass AS (
  SELECT
    v.*,
    CASE
      WHEN v.thesis_preference IS NULL OR v.thesis_preference = 'Not defined' OR v.thesis_type IS NOT NULL THEN NULL
      WHEN v.research_cue_hits > v.practical_cue_hits THEN 'Research'
      WHEN v.practical_cue_hits > v.research_cue_hits THEN 'Practical'
      ELSE 'Unknown'
    END AS inferred_type
  FROM validated v
  WHERE v.coverage IS NULL OR v.coverage >= v.coverage_threshold
),
ranked AS (
  SELECT
    cp.*,
    COALESCE(MAX(cp.topic_rank) OVER (), 0::real) AS max_rank
  FROM coverage_pass cp
),
scored AS (
  SELECT
    r.*,
    CASE
      WHEN r.max_rank > 0 THEN r.topic_rank / r.max_rank
      ELSE 0::real
    END AS topic_rank_norm,
    (0.8 * CASE WHEN r.max_rank > 0 THEN r.topic_rank / r.max_rank ELSE 0::real END) +
    (0.2 * COALESCE(r.coverage, 0::numeric)) AS final_score
  FROM ranked r
)
SELECT
  topic_id,
  title,
  description,
  area,
  thesis_type,
  created_at,
  topic_rank,
  topic_rank_norm,
  coverage,
  final_score,
  inferred_type,
  research_cue_hits,
  practical_cue_hits
FROM scored
ORDER BY final_score DESC, topic_rank DESC, created_at DESC NULLS LAST
LIMIT 1
`;

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

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
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
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

app.post('/api/recommendation/hybrid', requireAuthOptional, async (req, res) => {
  const body = req.body || {};
  const baseInput = parseRecommendationInput({
    body,
    reqUserId: req.userId,
    normalizeLongText: normalizeWhitespace
  });
  if (baseInput.error) {
    return res.status(baseInput.error.status).json({ message: baseInput.error.message });
  }
  const { major, thesisPreference, includeKeywords, excludeKeywords, careerAim, interests, effectiveUserId } = baseInput;

  const includeTokens = tokenizeKeywords(includeKeywords);
  const excludeTokens = tokenizeKeywords(excludeKeywords);
  const conflictingTokens = [...includeTokens].filter((token) => excludeTokens.has(token)).sort();
  if (conflictingTokens.length) {
    return res.status(400).json({
      message: 'Conflicting constraints: keywords appear in both include and exclude.',
      conflictingTokens
    });
  }

  const extractedTokens = extractUserTokens({
    major,
    includeKeywords,
    careerAim,
    interests
  });
  const userQuery = buildUserQuery({ major, includeKeywords, careerAim, interests });
  const majorAllowlist = HYBRID_RECOMMENDATION_CONFIG.majorAreaAllowlist[major];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const intentId = await createUserIntent(client, {
      userId: effectiveUserId,
      major,
      thesisPreference,
      includeKeywords,
      excludeKeywords,
      careerAim,
      interests
    });

    const recommendationResult = await client.query(HYBRID_RECOMMENDATION_SQL, [
      majorAllowlist,
      thesisPreference,
      userQuery,
      excludeKeywords,
      extractedTokens,
      HYBRID_RECOMMENDATION_CONFIG.coverageThreshold,
      HYBRID_RECOMMENDATION_CONFIG.researchCues,
      HYBRID_RECOMMENDATION_CONFIG.practicalCues
    ]);

    if (!recommendationResult.rowCount) {
      await client.query('COMMIT');
      return res.status(404).json({
        message: 'No thesis topic matched your filters.',
        intentId
      });
    }

    const best = recommendationResult.rows[0];
    const topicRank = Number(best.topic_rank || 0);
    const topicRankNorm = Number(best.topic_rank_norm || 0);
    const coverage = best.coverage === null ? null : Number(best.coverage);
    const finalScore = Number(best.final_score || 0);
    const breakdown = {
      scores: {
        finalScore,
        topicRank,
        topicRankNorm,
        coverage
      },
      filters: {
        majorAllowlist,
        thesisPreferenceApplied: thesisPreference !== 'Not defined',
        excludeApplied: Boolean(excludeKeywords),
        coverageThreshold: HYBRID_RECOMMENDATION_CONFIG.coverageThreshold
      },
      tokens: extractedTokens,
      validation: {
        inferredType: best.inferred_type,
        researchCueHits: Number(best.research_cue_hits || 0),
        practicalCueHits: Number(best.practical_cue_hits || 0)
      }
    };
    const recommendationId = randomUUID();

    await insertTopicRecommendation(client, {
      recommendationId,
      userId: effectiveUserId,
      intentId,
      topicId: best.topic_id,
      finalScore,
      breakdown
    });

    await client.query('COMMIT');
    return res.status(201).json({
      bestTopic: {
        topic_id: best.topic_id,
        title: best.title,
        description: best.description,
        area: best.area,
        thesis_type: best.thesis_type,
        created_at: best.created_at
      },
      scores: breakdown.scores,
      filters: breakdown.filters,
      explain: buildHybridExplanation({
        topicTitle: best.title,
        area: best.area,
        thesisType: best.thesis_type,
        thesisPreference,
        coverage,
        topicRankNorm,
        inferredType: best.inferred_type
      }),
      recommendationId,
      intentId
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ message: 'Hybrid recommendation failed' });
  } finally {
    client.release();
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
      `SELECT topic_id AS id, area, title, description, NULL::text AS "imageUrl", created_at AS "createdAt"
         FROM thesis_topics
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
      `SELECT topic_id AS id, area, title, description, NULL::text AS "imageUrl"
         FROM thesis_topics
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
      `SELECT topic_id AS id, area, title, description, NULL::text AS "imageUrl", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM thesis_topics
        WHERE topic_id = $1`,
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
      `SELECT topic_id AS id, area, title, description, thesis_type AS "thesisType", NULL::text AS "imageUrl", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM thesis_topics
        ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB fetch failed' });
  }
});

app.post('/api/admin/topics', requireAdmin, async (req, res) => {
  const { area, title, description = null, thesisType = null } = req.body || {};
  if (!area || !title || !thesisType) {
    return res.status(400).json({ message: 'area, title, thesisType are required' });
  }
  if (!ALLOWED_TOPIC_AREAS.has(area)) {
    return res.status(400).json({ message: 'area is invalid for Phase 2 taxonomy' });
  }
  if (!ALLOWED_TOPIC_THESIS_TYPES.has(thesisType)) {
    return res.status(400).json({ message: 'thesisType must be Research or Practical' });
  }
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO thesis_topics (topic_id, area, title, description, thesis_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, area, title, description, thesisType]
    );
    res.status(201).json({ id, area, title, description, thesisType, imageUrl: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB insert failed' });
  }
});

app.put('/api/admin/topics/:id', requireAdmin, async (req, res) => {
  const { area, title, description = null, thesisType = null } = req.body || {};
  if (!area || !title || !thesisType) {
    return res.status(400).json({ message: 'area, title, thesisType are required' });
  }
  if (!ALLOWED_TOPIC_AREAS.has(area)) {
    return res.status(400).json({ message: 'area is invalid for Phase 2 taxonomy' });
  }
  if (!ALLOWED_TOPIC_THESIS_TYPES.has(thesisType)) {
    return res.status(400).json({ message: 'thesisType must be Research or Practical' });
  }
  try {
    const result = await pool.query(
      `UPDATE thesis_topics
          SET area = $1,
              title = $2,
              description = $3,
              thesis_type = $4,
              updated_at = NOW()
        WHERE topic_id = $5
      RETURNING topic_id AS id, area, title, description, thesis_type AS "thesisType", NULL::text AS "imageUrl", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [area, title, description, thesisType, req.params.id]
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
    const result = await pool.query('DELETE FROM thesis_topics WHERE topic_id = $1', [req.params.id]);
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

function normalizeUserId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isUuid(trimmed) ? trimmed : null;
}

function parseRecommendationInput({
  body,
  reqUserId,
  normalizeLongText
}) {
  const major = normalizeText(body.major).toUpperCase();
  const thesisPreference = normalizePreference(body.thesisPreference);
  const includeKeywords = normalizeLongText(body.includeKeywords);
  const excludeKeywords = normalizeLongText(body.excludeKeywords);
  const careerAim = normalizeLongText(body.careerAim);
  const interests = normalizeLongText(body.interests);

  if (!ALLOWED_MAJORS.has(major)) {
    return { error: { status: 400, message: 'major must be one of IT, CS, DS' } };
  }
  if (!ALLOWED_PREFERENCES.has(thesisPreference)) {
    return { error: { status: 400, message: 'thesisPreference must be Research, Practical, or Not defined' } };
  }

  const requestedUserId = normalizeUserId(body.userId);

  if (reqUserId && requestedUserId && reqUserId !== requestedUserId) {
    return { error: { status: 403, message: 'Cannot create recommendation for another user' } };
  }

  return {
    major,
    thesisPreference,
    includeKeywords,
    excludeKeywords,
    careerAim,
    interests,
    effectiveUserId: reqUserId || requestedUserId || null
  };
}

async function createUserIntent(client, { userId, major, thesisPreference, includeKeywords, excludeKeywords, careerAim, interests }) {
  const result = await client.query(INSERT_USER_INTENT_SQL, [
    userId,
    major,
    thesisPreference,
    includeKeywords,
    excludeKeywords,
    careerAim,
    interests
  ]);
  return result.rows[0].intent_id;
}

async function insertTopicRecommendation(client, { recommendationId, userId, intentId, topicId, finalScore, breakdown }) {
  await client.query(INSERT_TOPIC_RECOMMENDATION_SQL, [
    recommendationId,
    userId,
    intentId,
    topicId,
    finalScore,
    JSON.stringify(breakdown)
  ]);
}

function isUuid(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value);
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeWhitespace(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function normalizePreference(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  if (raw.toLowerCase() === 'research') return 'Research';
  if (raw.toLowerCase() === 'practical') return 'Practical';
  if (raw.toLowerCase() === 'not defined') return 'Not defined';
  return raw;
}

function tokenizeKeywords(value) {
  const normalized = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ');

  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !HYBRID_RECOMMENDATION_CONFIG.stopwords.includes(token));

  return new Set(tokens);
}

function extractUserTokens({ major, includeKeywords, careerAim, interests }) {
  const combined = [includeKeywords, careerAim, interests, major].filter(Boolean).join(' ');
  return [...tokenizeKeywords(combined)];
}

function buildUserQuery({ major, includeKeywords, careerAim, interests }) {
  return normalizeWhitespace([includeKeywords, careerAim, interests, major].filter(Boolean).join(' '));
}

function buildHybridExplanation({
  topicTitle,
  area,
  thesisType,
  thesisPreference,
  coverage,
  topicRankNorm,
  inferredType
}) {
  const coverageText = coverage === null ? 'keyword coverage was skipped because no extracted tokens remained after normalization' : `coverage reached ${(coverage * 100).toFixed(0)}%`;
  const preferenceText =
    thesisPreference === 'Not defined'
      ? 'No thesis-type gate was applied.'
      : thesisType
        ? `The thesis type matched the requested ${thesisPreference.toLowerCase()} preference.`
        : inferredType && inferredType !== 'Unknown'
          ? `The topic has no stored thesis type, but cue validation leaned ${inferredType.toLowerCase()}.`
          : 'The topic has no stored thesis type, so preference validation stayed low-confidence.';

  return `${topicTitle} was selected because it survived the ${area} major filter, ${coverageText}, and ranked highest on full-text relevance (${(topicRankNorm * 100).toFixed(0)}% normalized). ${preferenceText}`;
}

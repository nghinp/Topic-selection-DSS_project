import express from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../config/database.js';
import { requireAuth, requireAuthOptional } from '../middleware/auth.js';
import { HYBRID_RECOMMENDATION_CONFIG } from '../config/hybridRecommendationConfig.js';
import {
  normalizeWhitespace,
  tokenizeKeywords,
  extractUserTokens,
  buildUserQuery,
  buildHybridExplanation,
  parseRecommendationInput
} from '../utils/validators.js';

const router = express.Router();

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
    COALESCE($6::text[], ARRAY[]::text[]) AS selected_interests,
    $7::numeric AS coverage_threshold,
    COALESCE($8::text[], ARRAY[]::text[]) AS research_cues,
    COALESCE($9::text[], ARRAY[]::text[]) AS practical_cues
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
    tt.topic_id, tt.title, tt.description, tt.short_description, tt.area, tt.thesis_type, tt.difficulty,
    COALESCE(tt.interests, ARRAY[]::text[]) AS interests,
    COALESCE(tt.detail_content, '{}'::jsonb) AS detail_content,
    tt.created_at, tt.search_vec,
    LOWER(CONCAT_WS(' ', tt.title, COALESCE(tt.short_description, ''), COALESCE(tt.description, ''), tt.area, COALESCE(tt.search_text, ''))) AS search_text,
    ti.thesis_preference, ti.include_tsq, ti.extracted_tokens, ti.selected_interests, ti.coverage_threshold, ti.research_cues, ti.practical_cues
  FROM thesis_topics tt
  CROSS JOIN ts_input ti
  WHERE tt.area = ANY(ti.major_allowlist)
    AND (ti.exclude_tsq IS NULL OR NOT (tt.search_vec @@ ti.exclude_tsq))
    AND tt.thesis_type = ti.thesis_preference
),
validated AS (
  SELECT
    c.*,
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
    CASE
      WHEN cardinality(c.selected_interests) = 0 THEN 0
      ELSE (
        SELECT COUNT(*)
        FROM unnest(c.selected_interests) AS selected_interest
        WHERE selected_interest = ANY(c.interests)
      )
    END AS matched_selected_interests_count,
    CASE
      WHEN cardinality(c.selected_interests) = 0 THEN NULL::numeric
      ELSE (
        SELECT COUNT(*)::numeric
        FROM unnest(c.selected_interests) AS selected_interest
        WHERE selected_interest = ANY(c.interests)
      ) / cardinality(c.selected_interests)
    END AS interest_match_score,
    (SELECT COUNT(*) FROM unnest(c.research_cues) AS cue WHERE POSITION(cue IN c.search_text) > 0) AS research_cue_hits,
    (SELECT COUNT(*) FROM unnest(c.practical_cues) AS cue WHERE POSITION(cue IN c.search_text) > 0) AS practical_cue_hits
  FROM candidates c
),
coverage_pass AS (
  SELECT
    v.*,
    NULL::text AS inferred_type
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
    CASE WHEN r.max_rank > 0 THEN r.topic_rank / r.max_rank ELSE 0::real END AS topic_rank_norm,
    CASE
      WHEN cardinality(r.selected_interests) > 0 THEN
        (0.55 * CASE WHEN r.max_rank > 0 THEN r.topic_rank / r.max_rank ELSE 0::real END) +
        (0.15 * COALESCE(r.coverage, 0::numeric)) +
        (0.30 * COALESCE(r.interest_match_score, 0::numeric))
      ELSE
        (0.8 * CASE WHEN r.max_rank > 0 THEN r.topic_rank / r.max_rank ELSE 0::real END) +
        (0.2 * COALESCE(r.coverage, 0::numeric))
    END AS final_score
  FROM ranked r
)
SELECT topic_id, title, description, short_description, area, thesis_type, difficulty, interests, detail_content, created_at,
       topic_rank, topic_rank_norm, coverage, matched_selected_interests_count, interest_match_score, final_score,
       inferred_type, research_cue_hits, practical_cue_hits
FROM scored
ORDER BY final_score DESC, topic_rank DESC, created_at DESC NULLS LAST
LIMIT 1
`;

// Recommendation actual - handles POST /api/recommendation/hybrid
router.post('/hybrid', requireAuthOptional, async (req, res) => {
  const body = req.body || {};
  const baseInput = parseRecommendationInput({ body, reqUserId: req.userId });
  if (baseInput.error) return res.status(baseInput.error.status).json({ message: baseInput.error.message });

  const { major, thesisPreference, includeKeywords, excludeKeywords, careerAim, selectedInterests, effectiveUserId } = baseInput;
  const hasIncludeKeywords = normalizeWhitespace(includeKeywords).length > 0;
  const hasCareerAim = normalizeWhitespace(careerAim).length > 0;
  const hasInterests = Array.isArray(selectedInterests) && selectedInterests.length > 0;
  const recommendationMode = hasIncludeKeywords || hasCareerAim || hasInterests;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const intentId = await createUserIntent(client, { userId: effectiveUserId, major, thesisPreference, includeKeywords, excludeKeywords, careerAim, interests: selectedInterests });

    if (!recommendationMode) {
      await client.query('COMMIT');
      return res.status(400).json({ message: 'Minimum input required.', intentId });
    }

    const { rows } = await client.query(HYBRID_RECOMMENDATION_SQL, [
      HYBRID_RECOMMENDATION_CONFIG.majorAreaAllowlist[major],
      thesisPreference, buildUserQuery({ major, includeKeywords, careerAim }),
      excludeKeywords, extractUserTokens({ major, includeKeywords, careerAim }),
      selectedInterests, HYBRID_RECOMMENDATION_CONFIG.coverageThreshold,
      HYBRID_RECOMMENDATION_CONFIG.researchCues, HYBRID_RECOMMENDATION_CONFIG.practicalCues
    ]);

    if (!rows.length) {
      await client.query('COMMIT');
      return res.status(404).json({ message: 'No matches found.', intentId });
    }

    const best = rows[0];
    const breakdown = {
      scores: { finalScore: Number(best.final_score), topicRank: Number(best.topic_rank), topicRankNorm: Number(best.topic_rank_norm), coverage: best.coverage === null ? null : Number(best.coverage), interestMatchScore: best.interest_match_score === null ? null : Number(best.interest_match_score) },
      filters: { selectedInterests, coverageThreshold: HYBRID_RECOMMENDATION_CONFIG.coverageThreshold },
      validation: { inferredType: best.inferred_type, researchCueHits: Number(best.research_cue_hits), practicalCueHits: Number(best.practical_cue_hits) }
    };

    const recommendationId = randomUUID();
    await client.query(INSERT_TOPIC_RECOMMENDATION_SQL, [recommendationId, effectiveUserId, intentId, best.topic_id, breakdown.scores.finalScore, JSON.stringify(breakdown)]);
    await client.query('COMMIT');

    res.status(201).json({
      bestTopic: best,
      scores: breakdown.scores,
      explain: buildHybridExplanation({ topicTitle: best.title, area: best.area, thesisType: best.thesis_type, topicInterests: best.interests, selectedInterests, thesisPreference, coverage: breakdown.scores.coverage, interestMatchScore: breakdown.scores.interestMatchScore, topicRankNorm: breakdown.scores.topicRankNorm, inferredType: best.inferred_type }),
      recommendationId, intentId
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Recommendation failed' });
  } finally { client.release(); }
});

// Recommendations History - handles GET /api/recommendations or /api/recommendation/history
router.get(['/', '/history'], requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.rec_id AS id, r.topic_id AS "topicId", tt.title, tt.area, r.final_score AS score, r.created_at AS "createdAt"
         FROM topic_recommendations r
         JOIN thesis_topics tt ON tt.topic_id = r.topic_id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC
        LIMIT 10`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'History fetch failed' });
  }
});

async function createUserIntent(client, { userId, major, thesisPreference, includeKeywords, excludeKeywords, careerAim, interests }) {
  const result = await client.query(INSERT_USER_INTENT_SQL, [userId, major, thesisPreference, includeKeywords, excludeKeywords, careerAim, interests ?? []]);
  return result.rows[0].intent_id;
}

export default router;

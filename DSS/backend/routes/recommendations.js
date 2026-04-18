import express from 'express';
import { pool } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Recommendations History - handles GET /api/recommendations
router.get(['/', '/history'], requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `WITH legacy_history AS (
         SELECT
           r.rec_id AS id,
           r.topic_id AS "topicId",
           tt.title,
           tt.area,
           r.final_score AS score,
           r.created_at AS "createdAt",
           'legacy'::text AS source
         FROM topic_recommendations r
         JOIN thesis_topics tt ON tt.topic_id = r.topic_id
         WHERE r.user_id = $1
       ),
       generated_history AS (
         SELECT
           g.id,
           NULL::uuid AS "topicId",
           g.title,
           COALESCE(g.review_data->>'specialization', g.review_data->>'direction', 'Generated Topic') AS area,
           NULL::numeric AS score,
           g.created_at AS "createdAt",
           'generated'::text AS source
         FROM generated_topics g
         WHERE g.user_id = $1
       )
       SELECT *
       FROM legacy_history
       UNION ALL
       SELECT *
       FROM generated_history
       WHERE NOT EXISTS (SELECT 1 FROM legacy_history)
       ORDER BY "createdAt" DESC
       LIMIT 10`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'History fetch failed' });
  }
});

export default router;

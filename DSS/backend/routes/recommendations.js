import express from 'express';
import { pool } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Recommendations History - handles GET /api/recommendations
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

export default router;

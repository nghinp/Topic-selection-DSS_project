import express from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT st.id, st.topic, st.label, st.created_at AS "createdAt",
              tt.title, tt.area
         FROM saved_topics st
         LEFT JOIN thesis_topics tt ON tt.topic_id = st.topic::uuid
        WHERE st.user_id = $1
        ORDER BY st.created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Saved topics fetch failed' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { topic, label = null } = req.body || {};
  if (!topic) return res.status(400).json({ message: 'topic is required' });
  try {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO saved_topics (id, user_id, topic, label)
       VALUES ($1, $2, $3, $4)`,
      [id, req.userId, topic, label]
    );
    res.status(201).json({ id, ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Topic save failed' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM saved_topics WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!result.rowCount) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Topic deletion failed' });
  }
});

export default router;

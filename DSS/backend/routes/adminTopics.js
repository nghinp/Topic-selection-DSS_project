import express from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../config/database.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  normalizeWhitespace,
  normalizeDifficulty,
  normalizeDetailContent,
  normalizeInterestArray,
  ALLOWED_TOPIC_AREAS_SET,
  ALLOWED_TOPIC_THESIS_TYPES_SET
} from '../utils/validators.js';

const router = express.Router();

router.post('/', requireAdmin, async (req, res) => {
  const { area, title, description = null, thesisType = null, shortDescription = null, difficulty = null } = req.body || {};
  if (!area || !title || !thesisType) return res.status(400).json({ message: 'area, title, thesisType are required' });
  if (!ALLOWED_TOPIC_AREAS_SET.has(area)) return res.status(400).json({ message: 'area is invalid' }); 

  const ti = normalizeInterestArray(req.body?.interests, { maxItems: 3 });
  if (ti.error) return res.status(ti.error.status).json({ message: ti.error.message });
  const dif = normalizeDifficulty(difficulty);
  if (dif.error) return res.status(dif.error.status).json({ message: dif.error.message });
  const det = normalizeDetailContent(req.body?.detailContent);
  if (det.error) return res.status(det.error.status).json({ message: det.error.message });

  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO thesis_topics (topic_id, area, title, description, thesis_type, interests, short_description, difficulty, detail_content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, area, title, description, thesisType, ti.value, normalizeWhitespace(shortDescription), dif.value, JSON.stringify(det.value)]
    );
    res.status(201).json({ id, title, ok: true });
  } catch (err) { console.error(err); res.status(500).json({ message: 'DB insert failed' }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { area, title, description = null, thesisType = null, shortDescription = null, difficulty = null } = req.body || {};
  if (!area || !title || !thesisType) return res.status(400).json({ message: 'area, title, thesisType are required' });
  if (!ALLOWED_TOPIC_AREAS_SET.has(area)) return res.status(400).json({ message: 'area is invalid' }); 
  
  const ti = normalizeInterestArray(req.body?.interests, { maxItems: 3 });
  const dif = normalizeDifficulty(difficulty);
  const det = normalizeDetailContent(req.body?.detailContent);
  
  try {
    const result = await pool.query(
      `UPDATE thesis_topics
          SET area = $1, title = $2, description = $3, thesis_type = $4, interests = $5,
              short_description = $6, difficulty = $7, detail_content = $8::jsonb, updated_at = NOW()
        WHERE topic_id = $9
       RETURNING topic_id AS id`,
      [area, title, description, thesisType, ti.value, normalizeWhitespace(shortDescription), dif.value, JSON.stringify(det.value), req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'DB update failed' }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM thesis_topics WHERE topic_id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ message: 'DB delete failed' }); }
});

export default router;

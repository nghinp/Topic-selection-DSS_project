import express from 'express';
import { pool } from '../config/database.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { area } = req.query || {};
  let sql = `SELECT topic_id AS id, area, title, description, thesis_type AS "thesisType", 
                    COALESCE(interests, ARRAY[]::text[]) AS interests, NULL::text AS "imageUrl", 
                    created_at AS "createdAt", updated_at AS "updatedAt",
                    short_description AS "shortDescription", difficulty, 
                    COALESCE(detail_content, '{}'::jsonb) AS "detailContent"
               FROM thesis_topics`;
  const params = [];
  if (area) { sql += ' WHERE area = $1'; params.push(area); }
  sql += ' ORDER BY created_at DESC';

  try { const { rows } = await pool.query(sql, params); res.json(rows); } 
  catch (err) { console.error(err); res.status(500).json({ message: 'Fetch failed' }); }
});

router.post('/search', async (req, res) => {
  const { query = '' } = req.body || {};
  if (!query.trim()) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT topic_id AS id, area, title, description, thesis_type AS "thesisType", 
              COALESCE(interests, ARRAY[]::text[]) AS interests, created_at AS "createdAt",
              short_description AS "shortDescription", difficulty
         FROM thesis_topics
        WHERE search_vec @@ websearch_to_tsquery('english', $1)
           OR title ILIKE $2
        ORDER BY ts_rank(search_vec, websearch_to_tsquery('english', $1)) DESC
        LIMIT 20`,
      [query, `%${query}%`]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Search failed' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT topic_id AS id, area, title, description, thesis_type AS "thesisType", 
              COALESCE(interests, ARRAY[]::text[]) AS interests, NULL::text AS "imageUrl", 
              created_at AS "createdAt", updated_at AS "updatedAt",
              short_description AS "shortDescription", difficulty, 
              COALESCE(detail_content, '{}'::jsonb) AS "detailContent"
         FROM thesis_topics
        WHERE topic_id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Topic not found' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Fetch failed' }); }
});

export default router;
